"use client";

import { ReactNode } from "react";
import { UserProvider } from "@/context/UserContext";
import { MeetingProvider } from "@/context/MeetingContext";
import { BookingProvider } from "@/context/BookingContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <UserProvider>
      <MeetingProvider>
        <BookingProvider>{children}</BookingProvider>
      </MeetingProvider>
    </UserProvider>
  );
}
