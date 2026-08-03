// ═══════════════════════════════════════════
// Webex Service — Guest Token + Recording
// ═══════════════════════════════════════════

import axios from 'axios';

const WEBEX_API_BASE = 'https://webexapis.com/v1';

/**
 * Request guest token จาก Webex Guest Issuer API
 */
export async function getWebexGuestToken(roomKey: string, displayName: string): Promise<string> {
  try {
    // TODO: ต้องมี backend auth ก่อนเรียก API นี้
    // ปัจจุบัน placeholder เท่านั้น

    if (!process.env.WEBEX_BOT_TOKEN) {
      throw new Error('WEBEX_BOT_TOKEN not configured');
    }

    const response = await axios.post(
      `${WEBEX_API_BASE}/guest/tokens`,
      {
        hostEmail: process.env.WEBEX_ADMIN_EMAIL,
        expiresIn: 3600,
        displayName: displayName
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WEBEX_BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.token;
  } catch (error) {
    console.error('❌ Failed to get Webex guest token:', error);
    throw error;
  }
}

/**
 * หา recording ID จาก meeting ID
 */
export async function getWebexRecordingId(meetingId: string): Promise<string | null> {
  try {
    // TODO: ค้นหา recording ที่ match กับ meeting นี้
    return null;
  } catch (error) {
    console.error('❌ Failed to get recording ID:', error);
    throw error;
  }
}

/**
 * Request transcript จาก Webex
 */
export async function requestWebexTranscript(recordingId: string): Promise<string> {
  try {
    // TODO: เรียก Webex Transcript API
    return `transcript-job-${recordingId}`;
  } catch (error) {
    console.error('❌ Failed to request transcript:', error);
    throw error;
  }
}

/**
 * Poll transcript status
 */
export async function getWebexTranscriptStatus(recordingId: string): Promise<any> {
  try {
    // TODO: เรียก Webex API ถามว่าถอดเสร็จหรือยัง
    return { status: 'pending', vtt: '' };
  } catch (error) {
    console.error('❌ Failed to get transcript status:', error);
    throw error;
  }
}

/**
 * Parse Webex VTT format → TranscriptSegment[]
 */
export function parseWebexVTT(vttContent: string): any[] {
  const segments = [];
  const lines = vttContent.split('\n');

  let currentSpeaker = '';
  let currentText = '';
  let startTime = 0;
  let endTime = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Match time line: "00:00:15.000 --> 00:00:45.000"
    if (line.includes('-->')) {
      const [start, end] = line.split('-->').map(t => t.trim());
      startTime = timeToSeconds(start);
      endTime = timeToSeconds(end);
    }

    // Match speaker: "<v Speaker Name>text"
    const speakerMatch = line.match(/^<v (.*?)>(.*)/);
    if (speakerMatch) {
      currentSpeaker = speakerMatch[1];
      currentText = speakerMatch[2];

      // Accumulate text until blank line
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '') {
          i = j;
          break;
        }
        currentText += ' ' + lines[j].trim();
      }

      segments.push({
        speakerId: `webex-${currentSpeaker}`,
        speakerName: currentSpeaker,
        startSec: startTime,
        endSec: endTime,
        text: currentText.trim()
      });

      currentText = '';
    }
  }

  return segments;
}

/**
 * Convert "00:01:30.500" → 90.5 seconds
 */
export function timeToSeconds(time: string): number {
  const parts = time.split(':');
  const hours = parseInt(parts[0]) || 0;
  const minutes = parseInt(parts[1]) || 0;
  const seconds = parseFloat(parts[2]) || 0;

  return hours * 3600 + minutes * 60 + seconds;
}
