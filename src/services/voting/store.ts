// src/services/voting/store.ts
import { openIdbDatabase, idbRun } from "@/lib/idb";
import type { VoteTopic, VoteRecord } from "./types";

const DB_NAME = "emeeting_voting";
const STORE = "vote_topics";
const VERSION = 1;

function db() {
  return openIdbDatabase(DB_NAME, VERSION, (database) => {
    if (!database.objectStoreNames.contains(STORE)) {
      database.createObjectStore(STORE, { keyPath: "key" });
    }
  });
}

function topicKey(meetingId: string, topicId: string) {
  return `${meetingId}/${topicId}`;
}

export async function saveTopic(topic: VoteTopic): Promise<void> {
  await idbRun(await db(), STORE, "readwrite", (tx) =>
    tx.objectStore(STORE).put({ key: topicKey(topic.meetingId, topic.id), ...topic })
  );
}

export async function getTopic(meetingId: string, topicId: string): Promise<VoteTopic | null> {
  const result = await idbRun<VoteTopic | undefined>(await db(), STORE, "readonly", (tx) =>
    tx.objectStore(STORE).get(topicKey(meetingId, topicId))
  );
  return result ?? null;
}

export async function listTopics(meetingId: string): Promise<VoteTopic[]> {
  const all = await idbRun<VoteTopic[]>(await db(), STORE, "readonly", (tx) => tx.objectStore(STORE).getAll());
  return (all ?? []).filter((t) => t.meetingId === meetingId).sort((a, b) => a.createdAt - b.createdAt);
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
