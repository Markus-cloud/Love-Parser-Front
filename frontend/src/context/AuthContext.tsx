import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { fetchCurrentUser, logoutRequest, sendCode, verifyCode } from "@/api/auth.service";
import { ApiError, getAccessToken, setAccessToken } from "@/api/client";
import type { SendCodeResponse } from "@/api/auth.service";
import type { AuthUser } from "@/types/auth";

interface VerifyPhoneCodePayload {
  authSessionId: string;
  code: string;
  password?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  requestPhoneCode: (phoneNumber: string) => Promise<SendCodeResponse>;
  verifyPhoneCode: (payload: VerifyPhoneCodePayload) => Promise<AuthUser | null>;
  me: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const me = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      return null;
    }

    try {
      const profile = await fetchCurrentUser();
      setUser(profile);
      return profile;
    } catch (error) {
      setUser(null);
      if (error instanceof ApiError && error.status === 401) {
        setAccessToken(null);
        return null;
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error("Не удалось загрузить профиль");
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await me();
      } catch {
        // silently ignore bootstrap errors
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrap();
  }, [me]);

  const requestPhoneCode = useCallback(async (rawPhoneNumber: string) => {
    const phoneNumber = rawPhoneNumber.trim();
    return sendCode(phoneNumber);
  }, []);

  const verifyPhoneCode = useCallback(
    async ({ authSessionId, code, password }: VerifyPhoneCodePayload) => {
      const payload = {
        auth_session_id: authSessionId,
        code,
        password,
      };

      const data = await verifyCode(payload);
      if (data?.access_token) {
        setAccessToken(data.access_token);
      }

      return me();
    },
    [me],
  );

  const logout = useCallback(async () => {
    const token = getAccessToken();

    try {
      if (token) {
        await logoutRequest();
      }
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      requestPhoneCode,
      verifyPhoneCode,
      me,
      logout,
    }),
    [user, isLoading, requestPhoneCode, verifyPhoneCode, me, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
