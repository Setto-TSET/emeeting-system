// src/services/voting/types.ts

export type VoteOption = {
  id: string; // "opt-1", "opt-2", ...
  label: string;
};

export type VoteRecord = {
  userId: string;
  userName: string;
  optionId: string;
  timestamp: number;
};

export type VoteTopic = {
  id: string; // "vote-{uuid}"
  meetingId: string;
  title: string;
  description?: string;
  options: VoteOption[];
  createdBy: string;
  createdByName: string;
  createdAt: number;
  status: "open" | "closed";
  votes: VoteRecord[];
};
