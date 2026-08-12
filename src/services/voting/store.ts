// src/services/voting/store.ts
import type { VoteTopic, VoteRecord } from "./types";

const DB_NAME = "emeeting_voting";
const STORE = "vote_topics";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function topicKey(meetingId: string, topicId: string) {
  return `${meetingId}/${topicId}`;
}

export async function saveTopic(topic: VoteTopic): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ key: topicKey(topic.meetingId, topic.id), ...topic });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getTopic(meetingId: string, topicId: string): Promise<VoteTopic | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(topicKey(meetingId, topicId));
    req.onsuccess = () => resolve((req.result as VoteTopic) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listTopics(meetingId: string): Promise<VoteTopic[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const all = (req.result as VoteTopic[]) ?? [];
      resolve(all.filter((t) => t.meetingId === meetingId).sort((a, b) => a.createdAt - b.createdAt));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function castVote(meetingId: string, topicId: string, record: VoteRecord): Promise<VoteTopic | null> {
  const topic = await getTopic(meetingId, topicId);
  if (!topic || topic.status !== "open") return topic;
  const votes = topic.votes.filter((v) => v.userId !== record.userId); // one vote per user, latest wins
  votes.push(record);
  const updated: VoteTopic = { ...topic, votes };
  await saveTopic(updated);
  return updated;
}

export async function closeTopic(meetingId: string, topicId: string): Promise<VoteTopic | null> {
  const topic = await getTopic(meetingId, topicId);
  if (!topic) return null;
  const updated: VoteTopic = { ...topic, status: "closed" };
  await saveTopic(updated);
  return updated;
}
