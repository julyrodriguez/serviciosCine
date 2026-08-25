import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged, User } from "firebase/auth";
import { useEffect, useState } from "react";

import { auth } from "./firebaseConfig";
import { sanitizeCineId, ADMIN_EMAILS } from "@/shared/utils";

type SessionProfile = {
  displayName: string;
  cineId: string;
};

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOficinas, setIsOficinas] = useState(false);
  const [profile, setProfile] = useState<SessionProfile>({
    displayName: "",
    cineId: "",
  });
  let displayName="";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      if (!nextUser) {
        setProfile({
          displayName: "",
          cineId: "",
        })
        setIsAdmin(false);
        setIsOficinas(false);
        setProfileLoading(false);
        return;
      }
      else{
        displayName=nextUser.displayName ?? (await AsyncStorage.getItem("displayName")) ?? "" ;
      }

      setProfileLoading(true);

      const cachedCineId = (await AsyncStorage.getItem("cineId")) ?? "";
      const fallbackEmailName = nextUser.email?.split("@")[0] ?? "";
      const fallbackCineId = sanitizeCineId(cachedCineId || fallbackEmailName);
      setProfile({
        displayName: displayName,
        cineId: fallbackCineId,
      });

      try {
        const tokenResult = await nextUser.getIdTokenResult();
        const claims = tokenResult.claims as any;
        const email = String(nextUser.email || "").trim().toLowerCase();
        const hasAdminClaim = claims?.admin === true || claims?.role === "admin";
        const isInAdminList = (ADMIN_EMAILS as readonly string[]).includes(email);
        const hasOficinasRole = claims?.role === "oficinas";
        setIsAdmin(hasAdminClaim || isInAdminList);
        setIsOficinas(hasOficinasRole);
      } catch (e) {
        console.error("Error getting token claims:", e);
        setIsAdmin(false);
        setIsOficinas(false);
      }

      setProfileLoading(false);
    });

    return () => {
      unsub();
    };
  }, []);

  return {
    user,
    loading: authLoading || profileLoading,
    authLoading,
    profileLoading,
    isLoggedIn: !!user,
    isAdmin,
    isOficinas,
    displayName: profile.displayName,
    cineId: profile.cineId,
  };
}