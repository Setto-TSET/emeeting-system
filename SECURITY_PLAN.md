# Security Plan: Prevent Document Leaks in Meetings

> **Philosophy:** The strongest lock is legal accountability, not technology. We combine 4 layers: access control, client-side deterrent, server-side audit, and policy enforcement.

---

## 📊 The 4-Layer Model

### Layer 1: Access Control ✓ (ทำแล้ว)
**Goal:** Only authorized people see documents

```
Frontend Access Control
├─ Authentication: JWT + session
├─ Authorization: can(user, "meeting.view", meeting)
├─ Meeting.confidentialityLevel: normal/restricted/top_secret
├─ Guest verification: magic token (24h expiry)
└─ Session timeout: 30min idle

Backend Access Control (ทำแล้ว — ไม่ใช่ Phase 2 อีกต่อไป)
├─ Password authentication จริง: bcrypt hash เทียบที่ server, ไม่เช็คฝั่ง client
│  └─ `POST /api/auth/login` → JWT ที่ frontend ใช้แนบทุก request ต่อจากนี้
├─ REST: `authMiddleware` ตรวจ JWT ทุก route ที่ไม่ใช่ login/guest
├─ WebSocket: token แนบ query string ตอน handshake, ปิดสาย 4401 (ไม่มี/token ผิด)
│  หรือ 4403 (ไม่ใช่สมาชิกห้องนี้) ก่อนรับ signal ใดๆ
├─ senderId ทุก signal มาจาก JWT ที่ server ถอดเอง — client ปลอมตัวเป็นคนอื่นไม่ได้
└─ Manager-only actions (ลดมือคนอื่น, บังคับเปลี่ยนเอกสารที่แชร์, หยุดแชร์ของคนอื่น,
   เริ่มแชร์ทับคนอื่น) เช็ค role ที่ server ทุกครั้ง ไม่ใช่แค่ซ่อนปุ่มฝั่ง UI

Database Level (Phase 2)
├─ Audit log table: who+when+ip
├─ Rate limiting: max 100 views/min per user
└─ Single-active session: kick old devices
```

### Layer 2: Client-Side Deterrent ✓ (ทำแล้ว)
**Goal:** Make copying/sharing obvious + inconvenient

```
Visual Discouragement
├─ Watermark
│  ├─ Shows: [viewer name] + [timestamp]
│  ├─ Updates every 5-30 วิ (depends on confidentiality level)
│  ├─ Opacity: 20% (visible in screenshot)
│  └─ Angle: -30° (diagonal, hard to remove)
│
├─ Blur-on-Blur
│  ├─ Window inactive → entire iframe blurred
│  ├─ z-20 overlay (above all content)
│  ├─ Shows: "หน้าต่างไม่ active — เนื้อหาถูกซ่อน"
│  └─ Re-activates instantly when focused
│
├─ No Download Button
│  ├─ Read-only in browser (no save-as)
│  ├─ Files in IndexedDB, not HTTP URL
│  └─ Object URL destroyed after session
│
├─ Right-Click Block
│  ├─ Disable context menu
│  ├─ Block Ctrl/Cmd+P (print)
│  ├─ Block Ctrl/Cmd+S (save)
│  └─ Note: DevTools can still bypass
│
└─ Visual Confidence Level Badge
   ├─ restricted: แถบสีส้ม "ลับ" + lock icon
   └─ top_secret: แถบสีแดง "ลับมาก"
```

### Layer 3: Server-Side Protection ⏳ (Phase 2)
**Goal:** Permanent record + policy enforcement

```
Backend Audit & Control
├─ Access Logging (Database)
│  ├─ Log every view: user_id, meeting_id, file_id, timestamp, ip_address
│  ├─ Retention: 1 year (compliance requirement)
│  ├─ Analysis: "Who accessed what when?"
│  └─ Forensics: Prove who leaked if it happens
│
├─ Signed URLs (60-second expiry)
│  ├─ Backend generates: /api/files/:id/signed-url?token=xxx
│  ├─ Signature expires after 60 seconds
│  ├─ Benefit: URL can't be shared externally
│  └─ Workaround: User must re-request (logged)
│
├─ Single-Active Session
│  ├─ One login per user at a time
│  ├─ Mobile + Desktop simultaneously? NO
│  ├─ Login from new device → old device kicked
│  └─ Prevents: credential sharing
│
├─ Server-Side Watermark Injection
│  ├─ Watermark embedded IN PDF (not overlay)
│  ├─ Survives any screenshot or print
│  ├─ User can't remove without tools
│  └─ Cost: PDF generation every view (or cache)
│
└─ Encryption at Rest + Transit
   ├─ TLS 1.3 for all connections
   ├─ Passwords: bcrypt + salt
   ├─ Sensitive data: AES-256 encryption
   └─ Keys: managed by HSM or vault
```

**อัปเดต:** สอง item ด้านล่างนี้ทำเสร็จแล้วนอกแผน Phase 2 เดิม (มาพร้อมงาน realtime sync) —
รายการอื่นใน Layer 3 (audit log, signed URL, single-active session, server-side watermark
injection) ยังไม่ทำ, ⏳ ต่อไป:
- One-vote-per-user บังคับด้วย primary key ของตาราง `vote_records` (`(topic_id, user_id)`)
  ไม่ใช่แค่เช็คฝั่ง client — ส่งซ้ำจะ error ที่ database ไม่ใช่แค่ UI กันไว้
- Passwords: bcrypt + salt ใช้งานจริงแล้วใน `backend/src/services/auth.ts` (ไม่ใช่แค่แผน)

### Layer 4: Policy & Legal ✓ (ต้องอยู่ในนโยบายองค์กร)
**Goal:** Create accountability (strongest deterrent)

```
NDA & Compliance
├─ Non-Disclosure Agreement
│  ├─ Every guest signs before joining
│  ├─ Violation = legal action possible
│  ├─ Makes watermark + audit trail admissible in court
│  └─ Deters 99% of casual leaks
│
├─ Data Classification Labels
│  ├─ Meeting: normal / restricted / top_secret
│  ├─ Documents: โดยธรรมชาติ / ลับ / ลับมาก
│  ├─ Behavior signal: people respect classifications
│  └─ Training: "Don't screenshot ลับ documents"
│
├─ Access Audit Trail (Legal Value)
│  ├─ Watermark proof: Bob viewed on 2026-08-03 10:30 AM
│  ├─ Audit log proof: IP 192.168.1.100, device Chrome/Mac
│  ├─ Together: nearly-conclusive evidence of who leaked
│  └─ Motivates users not to leak (accountability fear)
│
├─ Incident Response Plan
│  ├─ IF leak detected → check audit log
│  ├─ Identify who accessed → watermark matches
│  ├─ Escalate to legal + suspend account
│  └─ Evidence: admissible in court/arbitration
│
└─ Security Training & Awareness
   ├─ Annual: "Confidentiality 101"
   ├─ Message: "Watermark = we know who leaked"
   ├─ Reinforce: Don't share passwords, don't screenshot
   └─ Make it cultural (not just technical)
```

---

## 🚨 What We CAN'T Prevent (Be Honest About It)

| Leak Vector | Why We Can't Stop | Mitigation |
|---|---|---|
| **OS Screen Recording** (OBS, Win+G, Obs) | OS-level, browser can't intercept | Detection + NDA enforcement |
| **PrintScreen / Snipping Tool** | OS intercepts key before browser | Watermark visible in screenshot |
| **Mobile: Camera Recording** | Physical, impossible to block | Organizational policy |
| **DevTools** (inspect element) | User controls browser, owns the DOM | Access control + audit log |
| **User Shares Password** | Authorized user becomes leak vector | Single-active session + NDA |
| **Insider Threat** | Determined employee can defeat tech | Audit trail + legal action |
| **Physical Photograph** | Can't prevent taking photo of screen | Monitoring + policy enforcement |

---

## 📋 Current Implementation Status

### ✅ Already Built (Phase C)
```
Frontend Protection (Client-Side Deterrent)
├─ Watermark component
│  ├─ Name + timestamp display
│  ├─ Updates every configurable interval
│  ├─ Opacity: 20% (visible in screenshot)
│  ├─ Angle: -30° (hard to remove)
│  └─ Confidentiality level affects refresh rate
│
├─ Blur-on-Blur protection
│  ├─ visibilitychange + blur/focus events
│  ├─ z-20 opaque overlay (no CSS filter escape)
│  └─ Message: "หน้าต่างไม่ active — เนื้อหาถูกซ่อน"
│
├─ Right-Click + Print Block
│  ├─ onContextMenu: preventDefault()
│  ├─ Ctrl/Cmd+P: blocked
│  ├─ Ctrl/Cmd+S: blocked
│  └─ Limitation: DevTools bypass not prevented
│
├─ No Download Button
│  ├─ IndexedDB storage (per-browser)
│  ├─ Object URL (destroyed after session)
│  └─ No static HTTP URL to share
│
└─ Confidentiality Levels
   ├─ normal: watermark every 30s
   ├─ restricted: watermark every 15s, badge "ลับ"
   └─ top_secret: watermark every 5s, user-select: none
```

### ⏳ Phase 2 (Backend + Policy)
```
Backend Audit & Control
├─ Audit Log Database
├─ Signed URLs (60s expiry)
├─ Single-Active Session
├─ Server-Side Watermark Injection
└─ Encryption at Rest + Transit

Organization Policy
├─ NDA Template
├─ Data Classification Guide
├─ Security Training
└─ Incident Response Procedure
```

---

## 🎯 Implementation Roadmap

### Week 1: Frontend (Already done ✓)
- ✓ Watermark with dynamic timestamp
- ✓ Blur-on-blur protection
- ✓ Right-click + print block
- ✓ No download button
- ✓ Confidentiality level UI badge

### Week 2: Backend Audit (Phase 2)
- [ ] Audit log schema + logging middleware
- [ ] Signed URL endpoint (`/api/files/:id/signed-url`)
- [ ] Session management (single-active validation)
- [ ] Background job: cleanup expired URLs
- [ ] Test: URL expires, second access rejected

### Week 3: Policy & Legal (Org responsibility)
- [ ] Draft NDA document
- [ ] Data classification guide for organizers
- [ ] Security awareness email/training
- [ ] Incident response playbook
- [ ] Legal review + sign-off

### Week 4: Integration & Testing
- [ ] Wire audit logging to all endpoints
- [ ] Test watermark + audit trail together
- [ ] End-to-end: leak + detection scenario
- [ ] Documentation + runbook
- [ ] Org training kickoff

---

## 🔍 Testing Checklist

### Security Testing

```
Watermark Visibility
[ ] Screenshot with PrintScreen → watermark visible
[ ] Zoom in → watermark still visible at 200%
[ ] Change browser zoom → watermark follows
[ ] Multi-monitor → watermark on all screens
[ ] Different screen resolutions → watermark adapts

Blur-on-Blur
[ ] Focus window → blur removed immediately
[ ] Blur window → blur appears
[ ] Alt+Tab away → blur appears
[ ] Minimize → blur appears
[ ] Check z-index (should be z-20, above all content)

Right-Click Block
[ ] Right-click → no context menu
[ ] Ctrl+P → print dialog blocked
[ ] Ctrl+S → save dialog blocked
[ ] DevTools F12 → still opens (expected limitation)

Confidentiality Levels
[ ] normal: watermark updates 1x per 30s
[ ] restricted: watermark updates 1x per 15s + badge
[ ] top_secret: watermark updates 1x per 5s + badge
[ ] Verify timestamp is accurate (within ±2s)

Guest Access
[ ] Token expired (>24h) → 401 Unauthorized
[ ] Token valid → pre-fill name
[ ] Token used twice → second attempt rejected
[ ] Email mismatch → rejected
```

### User Experience Testing

```
Normal Workflow
[ ] Organizer creates meeting → allowGuestJoin toggle
[ ] Sends invite → guest receives email with link
[ ] Guest clicks link → form appears (name pre-filled)
[ ] Edits name (optional) → enters room
[ ] Sees watermark + documents
[ ] Chooses "restricted" → sees orange badge

Edge Cases
[ ] Guest without email → can still join with form
[ ] Guest token expires → show friendly error + re-request button
[ ] Rate limit hit (100 views/min) → show "Please wait" + retry
[ ] Session timeout (30min idle) → show "Expired, please refresh"
```

---

## 📊 Audit Trail Example

When Bob accesses a confidential document at 10:30 AM:

**Frontend (visible):**
```
Watermark shows: "สมชาย ใจดี" + "2026-08-03 10:30:45 AM"
Position: bottom-left corner
Opacity: 20% (readable in screenshot)
```

**Database (invisible but logged):**
```sql
INSERT INTO audit_logs VALUES (
  user_id: "U-001",
  action: "view_document",
  meeting_id: "MT-2569-001",
  file_id: "DOC-xyz",
  ip_address: "192.168.1.100",
  user_agent: "Chrome/126 Mac",
  timestamp: "2026-08-03 10:30:45 UTC"
);
```

**If Leak Happens:**
```
Find all screenshots with watermark "สมชาย"
→ Check audit_logs for when "U-001" accessed meeting
→ IP address matches (192.168.1.100)
→ User-Agent matches (Chrome/126 Mac)
→ Confidence: 99.9% it was Bob

Result: NDA enforcement + legal action possible
```

---

## ⚠️ Security Policy Template (Org)

Organizations using this system should adopt:

```
1. CONFIDENTIALITY LEVELS (Standard)
   ┌─────────────┬──────────────────┬────────────────────┐
   │ Level       │ Watermark        │ Usage              │
   ├─────────────┼──────────────────┼────────────────────┤
   │ normal      │ 1x per 30 sec    │ General meetings   │
   │ restricted  │ 1x per 15 sec    │ Strategy/planning  │
   │ top_secret  │ 1x per 5 sec     │ Board/legal/M&A    │
   └─────────────┴──────────────────┴────────────────────┘

2. GUEST REQUIREMENTS
   • Every external guest must sign NDA before receiving link
   • Magic link expires 24 hours after issue
   • Can only be used from one device (single-active session)
   • Violating watermark = admissible evidence in court

3. INCIDENT RESPONSE
   IF document leaked:
   1. Check audit log for access timestamp
   2. Match with watermark in leaked document
   3. Identify user → block account + escalate to legal
   4. Preserve evidence (audit log + leaked doc)
   5. Notify affected parties

4. TRAINING
   Annual security awareness: "Don't screenshot ลับ documents"
   Message: "Watermarks are unique per person—we WILL find the leaker"
```

---

## 📈 Effectiveness Metrics

Track these to measure how well the system works:

```
Metrics to Monitor
├─ Confirmed leaks per year (goal: 0)
├─ Attempted leaks detected (via audit log)
├─ Users who re-attempted after warning
├─ Guest invite -> actual join rate
├─ Average session duration
├─ Screenshot attempts detected (right-click blocks)
├─ Audit log queries (reactive investigations)
└─ Legal cases resolved (with watermark/audit as evidence)
```

---

## 🎓 Training & Communication

**Email 1: Launch announcement**
```
Subject: New Security Feature: Document Watermarking

Dear Team,

Effective [DATE], all meeting documents are now watermarked with your name and access time. This is NOT punitive — it's about accountability and trust.

If you accidentally screenshot a confidential meeting, the watermark shows it was you. This makes our organization safer and helps us catch actual leaks quickly.

What to know:
✓ Watermarks appear on all restricted/top_secret meetings
✓ They update every 15-30 seconds (varies by level)
✓ They're visible in screenshots, so don't try to crop them
✓ Violating our NDA while in a confidential meeting = serious legal consequence

We're not trying to catch you. We're trying to prevent outsiders from getting our secrets.

Questions? Contact Security Team.
```

**Email 2: Guest invitations**
```
Subject: You're invited to a confidential meeting

Hi [Guest Name],

You've been invited to attend: [Meeting Name] on [Date] [Time]

To join: [Click magic link]
What's inside: Confidential discussion
What to expect: Documents are watermarked with your name

By clicking the link, you acknowledge:
• You've read and agree to the attached NDA
• You understand watermarks show your access
• Sharing/leaking content violates the NDA

The link expires in 24 hours.
```

---

## 🔐 Final Message

> **Technology alone can't stop determined leakers.** But technology + policy + audit trail + legal consequences = 99%+ effective deterrent.

The watermark says: "We know exactly who you are, and we're watching."

That's the strongest lock there is.

---

**Document Created:** 2026-08-03  
**Version:** 1.0 (Security Architecture)  
**Status:** Ready for Organizational Adoption
