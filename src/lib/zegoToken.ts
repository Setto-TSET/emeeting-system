// ═══════════════════════════════════════════
// ZegoCloud Token04 Generator — TypeScript port
// Source: github.com/ZEGOCLOUD/zego_server_assistant
//
// ใช้ AES-256-CBC เข้ารหัส tokenInfo ด้วย ServerSecret
// ═══════════════════════════════════════════

import { createCipheriv, randomInt } from "crypto";

export enum ErrorCode {
  success = 0,
  appIDInvalid = 1,
  userIDInvalid = 3,
  secretInvalid = 5,
  effectiveTimeInSecondsInvalid = 6,
}

function makeRandomIv(): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  const result: string[] = [];
  for (let i = 0; i < 16; i++) {
    result.push(chars.charAt(Math.floor(Math.random() * chars.length)));
  }
  return result.join("");
}

function getAlgorithm(key: Buffer): string {
  switch (key.length) {
    case 16:
      return "aes-128-cbc";
    case 24:
      return "aes-192-cbc";
    case 32:
      return "aes-256-cbc";
    default:
      throw new Error("Invalid key length: " + key.length);
  }
}

function aesEncrypt(plainText: string, key: string, iv: string): ArrayBuffer {
  const cipher = createCipheriv(getAlgorithm(Buffer.from(key)), key, iv);
  cipher.setAutoPadding(true);
  const encrypted = cipher.update(plainText);
  const final = cipher.final();
  const out = Buffer.concat([encrypted, final]);
  return Uint8Array.from(out).buffer;
}

/**
 * Generate ZegoCloud token04
 *
 * @param appId - ZegoCloud App ID
 * @param userId - user identifier
 * @param secret - 32-char ServerSecret
 * @param effectiveTimeInSeconds - token validity period
 * @param payload - JSON string for privilege validation (room_id, privilege, stream_id_list)
 * @returns token string prefixed with "04"
 */
export function generateToken04(
  appId: number,
  userId: string,
  secret: string,
  effectiveTimeInSeconds: number,
  payload: string
): string {
  if (!appId || typeof appId !== "number") {
    throw { errorCode: ErrorCode.appIDInvalid, errorMessage: "appID invalid" };
  }
  if (!userId || typeof userId !== "string") {
    throw { errorCode: ErrorCode.userIDInvalid, errorMessage: "userId invalid" };
  }
  if (!secret || typeof secret !== "string" || secret.length !== 32) {
    throw { errorCode: ErrorCode.secretInvalid, errorMessage: "secret must be a 32 byte string" };
  }
  if (!effectiveTimeInSeconds || typeof effectiveTimeInSeconds !== "number") {
    throw { errorCode: ErrorCode.effectiveTimeInSecondsInvalid, errorMessage: "effectiveTimeInSeconds invalid" };
  }

  const createTime = Math.floor(Date.now() / 1000);
  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: randomInt(-2147483648, 2147483647),
    ctime: createTime,
    expire: createTime + effectiveTimeInSeconds,
    payload: payload || "",
  };

  const plainText = JSON.stringify(tokenInfo);
  const iv = makeRandomIv();
  const encryptBuf = aesEncrypt(plainText, secret, iv);

  const b1 = new Uint8Array(8);
  const b2 = new Uint8Array(2);
  const b3 = new Uint8Array(2);
  new DataView(b1.buffer).setBigInt64(0, BigInt(tokenInfo.expire), false);
  new DataView(b2.buffer).setUint16(0, iv.length, false);
  new DataView(b3.buffer).setUint16(0, encryptBuf.byteLength, false);

  const buf = Buffer.concat([
    Buffer.from(b1),
    Buffer.from(b2),
    Buffer.from(iv),
    Buffer.from(b3),
    Buffer.from(encryptBuf),
  ]);

  return "04" + Buffer.from(Uint8Array.from(buf).buffer).toString("base64");
}
