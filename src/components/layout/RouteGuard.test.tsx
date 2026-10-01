// src/components/layout/RouteGuard.test.tsx
//
// ตัวตนผู้ใช้ก๊อปข้ามแท็บได้ (localStorage) แต่ JWT อยู่ใน sessionStorage ต่อแท็บ —
// ถ้าไม่มี token ต้องไม่ render หน้าเลย และต้องล้างตัวตนค้าง + ส่งกลับหน้า login
// ไม่งั้นผู้ใช้เห็นชื่อตัวเองเหมือน login แล้ว แต่บันทึกอะไรก็ได้ "Missing authorization header"
"use client";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import RouteGuard from "./RouteGuard";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const replaceMock = vi.fn();
// router ของ Next เป็น instance เดียวตลอดอายุแอป — mock ต้องคืนตัวเดิมทุก render เหมือนกัน
const router = { replace: replaceMock, push: vi.fn() };
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => router,
}));

const signOutMock = vi.fn();
vi.mock("@/context/UserContext", () => ({
  useCurrentUser: () => ({
    currentUser: { id: "U-1", name: "ผู้ใช้ทดสอบ", email: "u1@test.local", systemRole: "admin" },
    setCurrentUser: vi.fn(),
    signOut: signOutMock,
    users: [],
  }),
}));

vi.mock("@/lib/access", () => ({
  canAccessRoute: () => true,
  getHomeRoute: () => "/dashboard",
}));

let token: string | null = null;
vi.mock("@/services/api/client", () => ({
  getAccessToken: () => token,
}));

describe("RouteGuard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    replaceMock.mockReset();
    signOutMock.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("ไม่มี token: ไม่ render หน้า, ล้างตัวตน, ส่งกลับหน้า login", () => {
    token = null;
    act(() => root.render(<RouteGuard><p>secret page</p></RouteGuard>));

    expect(container.textContent).not.toContain("secret page");
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith("/");
  });

  it("มี token: render หน้าตามปกติ ไม่ sign out", () => {
    token = "jwt-token-value";
    act(() => root.render(<RouteGuard><p>secret page</p></RouteGuard>));

    expect(container.textContent).toContain("secret page");
    expect(signOutMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
