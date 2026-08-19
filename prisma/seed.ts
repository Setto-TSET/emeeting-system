// ═══════════════════════════════════════════
// Seed — ยกข้อมูลจำลองใน src/data/index.ts เข้า MySQL
//
// รัน: npm run prisma:seed
// ทุกบัญชีได้รหัสผ่านเดียวกันคือ "password" (bcrypt) — ใช้เฉพาะ dev เท่านั้น
// idempotent: รันซ้ำได้ ใช้ upsert ทุกตาราง ไม่สร้างซ้ำ
// ═══════════════════════════════════════════

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { users, meetingRooms, bookings, meetings, committees } from "../src/data";

const prisma = new PrismaClient();

const DEV_PASSWORD = "password";

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  // ─── Committees ───
  for (const c of committees) {
    await prisma.committee.upsert({
      where: { id: c.id },
      create: { id: c.id, name: c.name, meetingsCount: c.meetingsCount, members: c.members },
      update: { name: c.name, meetingsCount: c.meetingsCount, members: c.members },
    });
  }

  // ─── Users ───
  for (const u of users) {
    await prisma.user.upsert({
      where: { id: u.id },
      create: {
        id: u.id,
        name: u.name,
        position: u.position,
        department: u.department,
        email: u.email,
        passwordHash,
        systemRole: u.systemRole,
      },
      update: {
        name: u.name,
        position: u.position,
        department: u.department,
        email: u.email,
        systemRole: u.systemRole,
      },
    });

    for (const committeeId of u.committeeIds) {
      await prisma.userCommittee.upsert({
        where: { userId_committeeId: { userId: u.id, committeeId } },
        create: { userId: u.id, committeeId },
        update: {},
      });
    }
  }

  // ─── Rooms ───
  // accountId ผูกกับบัญชี role "room" — ต้องสร้าง user ก่อนถึงจะอ้างถึงได้
  for (const r of meetingRooms) {
    const data = {
      name: r.name,
      category: r.category,
      categoryLabel: r.categoryLabel,
      capacity: r.capacity,
      location: r.location,
      floor: r.floor,
      amenities: r.amenities,
      image: r.image ?? null,
      status: r.status,
      hasZoomRoom: r.hasZoomRoom ?? false,
      zoomRoomDeviceId: r.zoomRoomDeviceId ?? null,
      hasIpad: r.hasIpad ?? false,
      accountId: r.accountId ?? null,
    };
    await prisma.room.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
  }

  // ─── Meetings (+ ตารางลูก) ───
  for (const m of meetings) {
    await prisma.meeting.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        name: m.name,
        shortName: m.shortName,
        type: m.type,
        committeeId: m.committeeId,
        organizerId: m.organizerId,
        organizerEmail: m.organizerEmail,
        emailSenderName: m.emailSenderName,
        date: m.date,
        startTime: m.startTime,
        endTime: m.endTime,
        location: m.location,
        conferenceProvider: m.conferenceProvider ?? "mock",
        conferenceLink: m.conferenceLink ?? null,
        conferenceRoomKey: m.conferenceRoomKey ?? null,
        zegoSipUri: m.zegoSipUri ?? null,
        status: m.status,
        displayFormat: m.displayFormat,
        description: m.description ?? null,
        savedToDrive: m.savedToDrive,
        allowGuestJoin: m.allowGuestJoin ?? false,
        transcriptStatus: m.transcriptStatus ?? "none",
        summaryDraftId: m.summaryDraftId ?? null,
        activeAgendaId: m.activeAgendaId ?? null,
        confidentialityLevel: m.confidentialityLevel ?? "normal",
        notifiedAt: m.notifiedAt ? new Date(m.notifiedAt) : null,
        reminderSentAt: m.reminderSentAt ? new Date(m.reminderSentAt) : null,
        createdAt: new Date(m.createdAt),
      },
      update: { name: m.name, status: m.status, location: m.location },
    });

    for (const p of m.participants) {
      await prisma.meetingParticipant.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          meetingId: m.id,
          userId: p.userId,
          name: p.name,
          position: p.position,
          role: p.role,
          department: p.department,
          email: p.email,
          attendance: p.attendance ?? "pending",
          present: p.present ?? false,
          inSystem: p.inSystem,
        },
        update: { attendance: p.attendance ?? "pending", present: p.present ?? false },
      });
    }

    for (const a of m.agenda) {
      await prisma.meetingAgendaItem.upsert({
        where: { id: a.id },
        create: { id: a.id, meetingId: m.id, no: a.no, title: a.title, detail: a.detail ?? null },
        update: { no: a.no, title: a.title, detail: a.detail ?? null },
      });
    }

    for (const perm of m.permissions) {
      await prisma.meetingPermission.upsert({
        where: { meetingId_userId: { meetingId: m.id, userId: perm.userId } },
        create: { meetingId: m.id, userId: perm.userId, name: perm.name, type: perm.type },
        update: { name: perm.name, type: perm.type },
      });
    }

    for (const d of m.zoomRoomDevices ?? []) {
      await prisma.zoomRoomDevice.upsert({
        where: { id: d.id },
        create: {
          id: d.id,
          meetingId: m.id,
          name: d.name,
          roomId: d.roomId,
          sipAddress: d.sipAddress ?? null,
          status: d.status,
        },
        update: { status: d.status },
      });
    }
  }

  // ─── Bookings ───
  for (const b of bookings) {
    await prisma.booking.upsert({
      where: { id: b.id },
      create: {
        id: b.id,
        roomId: b.roomId,
        title: b.title,
        bookedById: b.bookedById,
        department: b.department,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        attendees: b.attendees,
        purpose: b.purpose,
        status: b.status,
        extraRooms: b.extraRooms ?? undefined,
      },
      update: { status: b.status },
    });
  }

  console.log(
    `✅ seed เสร็จ — users ${users.length}, committees ${committees.length}, ` +
      `rooms ${meetingRooms.length}, meetings ${meetings.length}, bookings ${bookings.length}`
  );
  console.log(`   ทุกบัญชีใช้รหัสผ่าน "${DEV_PASSWORD}" (dev เท่านั้น)`);
}

main()
  .catch((e) => {
    console.error("❌ seed ล้มเหลว", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
