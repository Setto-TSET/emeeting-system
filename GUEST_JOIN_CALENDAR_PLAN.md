# Guest Join + Calendar Integration Plan

> Complete flow: Organizer sends advance invites → Guest receives email + .ics → Click → Auto-add to calendar

---

## 📊 User Flow

```
Organizer (Meeting Creation/Editing)
  ├─→ New tab: "เชิญผู้เข้าร่วมล่วงหน้า"
  ├─→ Add guests (email + name)
  ├─→ Click "ส่งเชิญ" 
  │
  ├─→ System actions:
  │   ├─ Generate magic link token (24h)
  │   ├─ Create .ics file (iCalendar format)
  │   ├─ Send email with:
  │   │  • Magic link (click to join)
  │   │  • .ics attachment (add to calendar)
  │   │  • Meeting details (date/time/location)
  │   │  • NDA notice
  │   └─ Save to guest_invites table
  │
  └─→ Toast: "ส่งเชิญแล้ว (pending: 3 guests)"

─────────────────────────────────────

Guest (Email Received)
  ├─→ Email from system:
  │   ├─ Subject: "Invited: [Meeting Name]"
  │   ├─ Body: Meeting details + NDA notice
  │   ├─ Buttons:
  │   │  • "Join Meeting" (magic link)
  │   │  • "Download Calendar" (.ics file)
  │   └─ .ics attached
  │
  ├─→ Option 1: Click "Join Meeting"
  │   └─→ /live/MT-2569-001?token=xyz
  │   └─→ See form "ยืนยันชื่อของคุณ"
  │   └─→ Enter room
  │
  ├─→ Option 2: Click "Download Calendar"
  │   └─→ Browser downloads .ics file
  │   └─→ Double-click → opens calendar app
  │   └─→ "Add to [Google Calendar/Outlook/Apple]?"
  │   └─→ Event auto-added
  │   └─→ Guest gets notification on meeting date
  │
  └─→ Option 3: Both (join + add to calendar)
      └─→ Organized guest experience
```

---

## 🛠️ Technical Implementation

### Part 1: Frontend — Guest Management UI

#### 1.1 New Tab in `/meetings/[id]/page.tsx`

```tsx
// Add to Tabs
<TabsContent value="invite-guests">
  <Card>
    <CardHeader>
      <CardTitle>เชิญผู้เข้าร่วมล่วงหน้า</CardTitle>
      <CardDescription>
        ส่งลิงค์เข้าห้องประชุมให้ผู้เข้าร่วมภายนอก 
        + เพิ่มลงปฏิทิน
      </CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {/* Guest List */}
      <div>
        <h3 className="text-sm font-medium mb-2">ผู้ที่เชิญแล้ว</h3>
        {invitedGuests.length === 0 ? (
          <p className="text-xs text-muted-foreground">ยังไม่มีการเชิญ</p>
        ) : (
          <div className="space-y-2">
            {invitedGuests.map(guest => (
              <div 
                key={guest.id}
                className="flex items-center justify-between p-2 border rounded"
              >
                <div>
                  <p className="text-sm font-medium">{guest.name}</p>
                  <p className="text-xs text-muted-foreground">{guest.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {guest.status === 'pending' ? '⏳ ส่งแล้ว' : '✓ เข้าร่วมแล้ว'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeGuest(guest.id)}
                    className="text-destructive"
                  >
                    ลบ
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Guest Form */}
      <Separator />
      <div className="space-y-3">
        <h3 className="text-sm font-medium">เพิ่มผู้เข้าร่วมใหม่</h3>
        <div>
          <label className="text-xs font-medium">Email</label>
          <Input
            type="email"
            placeholder="guest@example.com"
            value={newGuestEmail}
            onChange={(e) => setNewGuestEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium">ชื่อ</label>
          <Input
            placeholder="วรรณพร ใจสวย"
            value={newGuestName}
            onChange={(e) => setNewGuestName(e.target.value)}
          />
        </div>
        <Button
          onClick={addGuest}
          className="w-full"
        >
          เพิ่มผู้เข้าร่วม
        </Button>
      </div>

      {/* Send Invites */}
      <Separator />
      <Button
        onClick={sendInvites}
        disabled={invitedGuests.length === 0 || sendingInvites}
        className="w-full"
      >
        {sendingInvites ? '⏳ กำลังส่ง...' : `ส่งเชิญทั้งหมด (${invitedGuests.length})`}
      </Button>

      {/* Status */}
      {invitedGuests.filter(g => g.status === 'joined').length > 0 && (
        <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
          ✓ {invitedGuests.filter(g => g.status === 'joined').length} คนเข้าประชุมแล้ว
        </div>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

#### 1.2 State & Handlers

```tsx
const [invitedGuests, setInvitedGuests] = useState<Guest[]>([]);
const [newGuestEmail, setNewGuestEmail] = useState('');
const [newGuestName, setNewGuestName] = useState('');
const [sendingInvites, setSendingInvites] = useState(false);

const addGuest = () => {
  if (!newGuestEmail.trim() || !newGuestName.trim()) {
    toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
    return;
  }

  if (invitedGuests.some(g => g.email === newGuestEmail)) {
    toast.error('ผู้เข้าร่วมนี้เพิ่มแล้ว');
    return;
  }

  setInvitedGuests([
    ...invitedGuests,
    {
      id: `guest-${Date.now()}`,
      email: newGuestEmail,
      name: newGuestName,
      status: 'pending',
      invitedAt: new Date().toISOString()
    }
  ]);

  setNewGuestEmail('');
  setNewGuestName('');
  toast.success('เพิ่มผู้เข้าร่วมแล้ว');
};

const removeGuest = (guestId: string) => {
  setInvitedGuests(invitedGuests.filter(g => g.id !== guestId));
  toast.success('ลบผู้เข้าร่วมแล้ว');
};

const sendInvites = async () => {
  setSendingInvites(true);
  try {
    const response = await fetch('/api/guests/invite-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId: meeting.id,
        guests: invitedGuests.map(g => ({
          email: g.email,
          name: g.name,
          invitedBy: currentUser.name
        }))
      })
    });

    if (response.ok) {
      const data = await response.json();
      toast.success(`ส่งเชิญแล้ว: ${data.sent} คน`);
      
      // Refresh list
      const refreshed = await fetch(`/api/guests/list?meetingId=${meeting.id}`);
      const list = await refreshed.json();
      setInvitedGuests(list.guests);
    } else {
      toast.error('ส่งเชิญไม่สำเร็จ');
    }
  } finally {
    setSendingInvites(false);
  }
};
```

---

### Part 2: Backend — Magic Link + Calendar Generation

#### 2.1 Email with .ics Attachment

```typescript
// src/services/calendar.ts — Generate .ics file

export function generateCalendarFile(meeting: Meeting): string {
  const startDate = `${meeting.date.replace(/-/g, '')}T${meeting.startTime.replace(/:/g, '')}00`;
  const endDate = `${meeting.date.replace(/-/g, '')}T${meeting.endTime.replace(/:/g, '')}00`;
  
  const uid = `meeting-${meeting.id}@emeeting.local`;
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//e-Meeting//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstamp}
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:${escapeIcsText(meeting.name)}
DESCRIPTION:${escapeIcsText(meeting.description || '')}\\n\\nView in e-Meeting: [magic-link]
LOCATION:${escapeIcsText(meeting.location)}
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}
```

#### 2.2 Invite Email (with .ics)

```typescript
// src/services/email.ts — Send invite with calendar attachment

export async function sendGuestInvite(params: {
  guestEmail: string;
  guestName: string;
  meeting: Meeting;
  magicToken: string;
  sentBy: string;
}) {
  const { guestEmail, guestName, meeting, magicToken, sentBy } = params;

  const magicLink = `${process.env.FRONTEND_URL}/live/${meeting.id}?token=${magicToken}`;
  const calendarFile = generateCalendarFile(meeting);
  const calendarBuffer = Buffer.from(calendarFile, 'utf-8');

  const emailHtml = `
    <h2>คุณได้รับเชิญเข้าร่วมการประชุม</h2>
    
    <p><strong>ชื่อประชุม:</strong> ${escapeHtml(meeting.name)}</p>
    <p><strong>วันที่:</strong> ${meeting.date} เวลา ${meeting.startTime} น.</p>
    <p><strong>สถานที่:</strong> ${escapeHtml(meeting.location)}</p>
    <p><strong>ผู้เชิญ:</strong> ${escapeHtml(sentBy)}</p>

    <hr />

    <h3>วิธีเข้าร่วมประชุม:</h3>
    <ol>
      <li>
        <a href="${magicLink}">คลิกลิงก์นี้เพื่อเข้าประชุม</a>
        (ลิงก์ใช้ได้ 24 ชั่วโมง)
      </li>
      <li>
        หรือดาวน์โหลดไฟล์ .ics ด้านล่าง แล้วเพิ่มลงปฏิทินของคุณ
      </li>
    </ol>

    <hr />

    <h3>ข้อตกลง:</h3>
    <p>
      การเข้าร่วมประชุมนี้ถือว่าคุณ:
      <ul>
        <li>ยอมรับข้อตกลงการปกป้องความลับ (NDA)</li>
        <li>ยอมรับว่าเอกสารมีลายเซ็นดิจิทัล</li>
        <li>เข้าใจว่าการแชร์เอกสารลับเป็นการละเมิด NDA</li>
      </ul>
    </p>

    <hr />
    <p style="font-size: 12px; color: #666;">
      ลิงก์นี้ใช้ได้ 24 ชั่วโมง
      ห้ามแชร์ลิงก์นี้ให้ผู้อื่น
    </p>
  `;

  await sendEmail({
    to: guestEmail,
    subject: `เชิญ: ${meeting.name}`,
    html: emailHtml,
    attachments: [
      {
        filename: `${meeting.shortName || meeting.id}.ics`,
        content: calendarBuffer,
        contentType: 'text/calendar; charset=utf-8; method=REQUEST'
      }
    ]
  });

  // Log invitation
  await query(
    `INSERT INTO guest_invites 
     (meeting_id, guest_email, guest_name, magic_token, invited_by, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [meeting.id, guestEmail, guestName, magicToken, sentBy, 'pending']
  );
}
```

#### 2.3 Batch Invite Endpoint

```typescript
// POST /api/guests/invite-batch

app.post('/api/guests/invite-batch', asyncHandler(async (req: Request, res: Response) => {
  const { meetingId, guests } = req.body;
  const meeting = await getMeeting(meetingId);

  if (!meeting) {
    return res.status(404).json({ error: 'Meeting not found' });
  }

  // Check permission
  if (!can(req.user, 'meeting.manageGuests', meeting)) {
    return res.status(403).json({ error: 'No permission' });
  }

  let sent = 0;
  const errors = [];

  for (const guest of guests) {
    try {
      const token = jwt.sign(
        { meetingId, guestEmail: guest.email, guestName: guest.name },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      await sendGuestInvite({
        guestEmail: guest.email,
        guestName: guest.name,
        meeting,
        magicToken: token,
        sentBy: req.user.name
      });

      sent++;
    } catch (error) {
      errors.push({
        email: guest.email,
        error: (error as Error).message
      });
    }
  }

  res.json({
    sent,
    failed: errors.length,
    errors: errors.length > 0 ? errors : undefined
  });
}));
```

#### 2.4 Get Invited Guests List

```typescript
// GET /api/guests/list?meetingId=...

app.get('/api/guests/list', asyncHandler(async (req: Request, res: Response) => {
  const { meetingId } = req.query;

  const guests = await query(
    `SELECT id, guest_email as email, guest_name as name, status, invited_at, joined_at
     FROM guest_invites
     WHERE meeting_id = ?
     ORDER BY invited_at DESC`,
    [meetingId]
  );

  res.json({ guests });
}));
```

---

## 📋 Database Schema Updates

```sql
-- Extend guest_invites table
ALTER TABLE guest_invites ADD COLUMN (
  invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  joined_at TIMESTAMP NULL,
  calendar_added_at TIMESTAMP NULL,  -- When guest clicked "Add to calendar"
  email_sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  email_status ENUM('sent', 'bounced', 'opened') DEFAULT 'sent'
);

-- Track calendar interactions (optional)
CREATE TABLE guest_calendar_events (
  id INT PRIMARY KEY AUTO_INCREMENT,
  guest_invite_id INT NOT NULL,
  event_action ENUM('ics_downloaded', 'added_to_google', 'added_to_outlook', 'opened_in_default'),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (guest_invite_id) REFERENCES guest_invites(id)
);
```

---

## 🎯 Implementation Phases

### Phase 1: Frontend UI (2 days)
- [ ] Add "invite-guests" tab in meetings/[id]/page.tsx
- [ ] Guest list + add form
- [ ] Send button (calls batch API)
- [ ] Show invitation status

### Phase 2: Backend APIs (2 days)
- [ ] Generate .ics calendar file
- [ ] Send email with attachment
- [ ] Batch invite endpoint
- [ ] Get guests list endpoint
- [ ] Database migrations

### Phase 3: Email Enhancement (1 day)
- [ ] Setup email service (Sendgrid/AWS SES)
- [ ] HTML email template with branding
- [ ] Attachment handling
- [ ] Test with real emails

### Phase 4: Testing (1 day)
- [ ] Frontend: add guests, send invites
- [ ] Backend: receive email, verify .ics format
- [ ] Calendar: download .ics → add to Google/Outlook
- [ ] End-to-end: email → click magic link → join

### Total: 6 days

---

## 📧 Email Template

**Subject:** เชิญ: [Meeting Name]

```
┌─────────────────────────────────────┐
│  e-Meeting                          │
│  คุณได้รับเชิญเข้าร่วมการประชุม        │
└─────────────────────────────────────┘

ชื่อประชุม:     การประชุมคณะกรรมการบริหาร ครั้งที่ 5/2569
วันที่ / เวลา:   25 สิงหาคม 2569 เวลา 14:00 - 16:30 น.
สถานที่:         ห้องประชุม A-101 / Webex
ผู้เชิญ:         นาย สมชาย ใจดี

────────────────────────────────────────

[ปุ่ม]  เข้าร่วมประชุม  [ปุ่ม]  ดาวน์โหลด .ics
(ลิงก์ใช้ได้ 24 ชั่วโมง)

────────────────────────────────────────

✓ เมื่อคุณคลิก "เข้าร่วมประชุม":
  1. เข้าเว็บ e-Meeting (ไม่ต้องสมัครสมาชิก)
  2. ยืนยันชื่อของคุณ
  3. เห็นห้องประชุม + เอกสาร

✓ เมื่อคุณ "ดาวน์โหลด .ics":
  1. ไฟล์ดาวน์โหลด (.ics)
  2. ดับเบิลคลิก → เปิดด้วยปฏิทิน (Google/Outlook/Apple)
  3. "Add to calendar?" → Yes
  4. ได้ notification ในวันประชุม

────────────────────────────────────────

⚠️ สำคัญ:
• เอกสารมีลายเซ็นดิจิทัล
  (เราจะรู้ว่าใครถ่ายรูป)
• ห้ามแชร์ลิงก์ให้ผู้อื่น
• ลิงก์หมดอายุใน 24 ชั่วโมง

────────────────────────────────────────

บันทึก: การเข้าร่วมประชุมนี้ถือว่าคุณ
ยอมรับข้อตกลงการปกป้องความลับ (NDA)
```

---

## 🔄 Integration Points

### .ics File Format Example

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//e-Meeting//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:meeting-MT-2569-001@emeeting.local
DTSTAMP:20260825T140000Z
DTSTART:20260825T070000Z
DTEND:20260825T093000Z
SUMMARY:การประชุมคณะกรรมการบริหาร ครั้งที่ 5/2569
DESCRIPTION:สถานที่: ห้องประชุม A-101 / Webex\n
  เข้าร่วม: https://emeeting.local/live/MT-2569-001?token=xyz
LOCATION:ห้องประชุม A-101 / Webex
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR
```

Guest opens .ics → Calendar app recognizes → 1-click add

---

## ✅ Checklist

```
Frontend
[ ] New "invite-guests" tab in meetings/[id]
[ ] Guest list display (pending, joined, failed)
[ ] Add guest form (email + name)
[ ] Send invites button (batch)
[ ] Remove guest button
[ ] Status badge (pending/joined)
[ ] Toast notifications

Backend
[ ] POST /api/guests/invite-batch
[ ] GET /api/guests/list
[ ] Calendar file generation (.ics)
[ ] Email service integration
[ ] HTML email templates
[ ] Attachment handling
[ ] JWT token generation (24h expiry)
[ ] Database schema updates
[ ] Error handling + retry logic

Email
[ ] HTML template (branded)
[ ] .ics attachment
[ ] Magic link button
[ ] NDA notice
[ ] Branding + colors

Testing
[ ] Add 5 guests → send invites
[ ] Check email received
[ ] Download .ics → open in calendar
[ ] Verify event details match
[ ] Click magic link → form appears
[ ] Calendar notification on meeting day
[ ] Email bounces handled gracefully
```

---

## 💡 Future Enhancements

**Phase 2+:**
- [ ] Bulk upload: CSV file → invite multiple
- [ ] Calendar sync: auto-refresh when meeting changes
- [ ] Meeting reminders: email before meeting
- [ ] RSVP tracking: guest confirms attendance
- [ ] Meeting recording link: auto-send after meeting ends

---

## 🎓 Sample Result

When guest receives email:

```
From: noreply@emeeting.local
To: guest@example.com
Subject: เชิญ: การประชุมคณะกรรมการบริหาร ครั้งที่ 5/2569

[HTML email with logos + colors]

[Attachment: meeting-MT-2569-001.ics]
```

Guest clicks "Download" → calendar opens → 1 click to add.

Result: Meeting appears on guest's calendar with:
- ✓ Correct date/time
- ✓ Location
- ✓ Magic link in description
- ✓ Notification 15min before

Perfect UX! 🎉

---

**Created:** 2026-08-03  
**Status:** Ready for Implementation  
**Effort:** 6 days (frontend + backend + email)  
**Dependencies:** Email service (Sendgrid/AWS SES)
