-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `systemRole` ENUM('admin', 'executive', 'secretary', 'staff', 'external', 'room') NOT NULL DEFAULT 'staff',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_systemRole_idx`(`systemRole`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Committee` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `meetingsCount` INTEGER NOT NULL DEFAULT 0,
    `members` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserCommittee` (
    `userId` VARCHAR(191) NOT NULL,
    `committeeId` VARCHAR(191) NOT NULL,

    INDEX `UserCommittee_committeeId_idx`(`committeeId`),
    PRIMARY KEY (`userId`, `committeeId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Room` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('small', 'medium', 'large', 'conference', 'board') NOT NULL DEFAULT 'medium',
    `categoryLabel` VARCHAR(191) NOT NULL,
    `capacity` INTEGER NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `floor` VARCHAR(191) NOT NULL,
    `amenities` JSON NOT NULL,
    `image` VARCHAR(191) NULL,
    `status` ENUM('available', 'occupied', 'maintenance') NOT NULL DEFAULT 'available',
    `hasZoomRoom` BOOLEAN NOT NULL DEFAULT false,
    `zoomRoomDeviceId` VARCHAR(191) NULL,
    `hasIpad` BOOLEAN NOT NULL DEFAULT false,
    `accountId` VARCHAR(191) NULL,

    UNIQUE INDEX `Room_accountId_key`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Booking` (
    `id` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `bookedById` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `startTime` VARCHAR(191) NOT NULL,
    `endTime` VARCHAR(191) NOT NULL,
    `attendees` INTEGER NOT NULL,
    `purpose` TEXT NOT NULL,
    `status` ENUM('confirmed', 'pending', 'cancelled') NOT NULL DEFAULT 'pending',
    `extraRooms` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Booking_roomId_date_idx`(`roomId`, `date`),
    INDEX `Booking_bookedById_idx`(`bookedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Meeting` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `shortName` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `committeeId` VARCHAR(191) NOT NULL,
    `organizerId` VARCHAR(191) NULL,
    `organizerEmail` VARCHAR(191) NOT NULL,
    `emailSenderName` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `startTime` VARCHAR(191) NOT NULL,
    `endTime` VARCHAR(191) NOT NULL,
    `location` VARCHAR(191) NOT NULL,
    `conferenceProvider` ENUM('mock', 'teams', 'zoom', 'google_meet', 'zegocloud', 'other') NOT NULL DEFAULT 'mock',
    `conferenceLink` TEXT NULL,
    `conferenceRoomKey` VARCHAR(191) NULL,
    `zegoSipUri` VARCHAR(191) NULL,
    `status` ENUM('prepare', 'notified', 'in_progress', 'waiting_endorse', 'endorsed') NOT NULL DEFAULT 'prepare',
    `displayFormat` INTEGER NOT NULL DEFAULT 1,
    `description` TEXT NULL,
    `savedToDrive` BOOLEAN NOT NULL DEFAULT false,
    `allowGuestJoin` BOOLEAN NOT NULL DEFAULT false,
    `transcriptStatus` ENUM('none', 'processing', 'ready', 'failed') NOT NULL DEFAULT 'none',
    `summaryDraftId` VARCHAR(191) NULL,
    `activeAgendaId` VARCHAR(191) NULL,
    `extraTextBoxes` JSON NULL,
    `confidentialityLevel` ENUM('normal', 'restricted', 'top_secret') NOT NULL DEFAULT 'normal',
    `notifiedAt` DATETIME(3) NULL,
    `reminderSentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Meeting_committeeId_idx`(`committeeId`),
    INDEX `Meeting_organizerId_idx`(`organizerId`),
    INDEX `Meeting_status_idx`(`status`),
    INDEX `Meeting_date_idx`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MeetingParticipant` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `position` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `attendance` ENUM('attend', 'representative', 'absent', 'pending') NOT NULL DEFAULT 'pending',
    `present` BOOLEAN NOT NULL DEFAULT false,
    `inSystem` BOOLEAN NOT NULL DEFAULT false,

    INDEX `MeetingParticipant_meetingId_idx`(`meetingId`),
    INDEX `MeetingParticipant_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MeetingFile` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `size` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `uploadedBy` VARCHAR(191) NOT NULL,
    `type` ENUM('regulation', 'attachment', 'report_draft', 'report_final') NOT NULL DEFAULT 'attachment',
    `visibility` ENUM('public', 'committee', 'participants', 'restricted') NOT NULL DEFAULT 'participants',
    `allowedPositions` JSON NULL,
    `allowedUserIds` JSON NULL,
    `storageKey` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `sizeBytes` INTEGER NULL,

    INDEX `MeetingFile_meetingId_idx`(`meetingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MeetingAgendaItem` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `no` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `detail` TEXT NULL,
    `secretGroupId` VARCHAR(191) NULL,

    INDEX `MeetingAgendaItem_meetingId_idx`(`meetingId`),
    INDEX `MeetingAgendaItem_secretGroupId_idx`(`secretGroupId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgendaComment` (
    `id` VARCHAR(191) NOT NULL,
    `agendaItemId` VARCHAR(191) NOT NULL,
    `by` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `time` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgendaComment_agendaItemId_idx`(`agendaItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MeetingPermission` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('manager', 'reader') NOT NULL DEFAULT 'reader',

    INDEX `MeetingPermission_userId_idx`(`userId`),
    UNIQUE INDEX `MeetingPermission_meetingId_userId_key`(`meetingId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `sender` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `time` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatMessage_meetingId_idx`(`meetingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InviteToken` (
    `token` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `guestEmail` VARCHAR(191) NOT NULL,
    `guestName` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,
    `usedAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NOT NULL,

    INDEX `InviteToken_meetingId_idx`(`meetingId`),
    INDEX `InviteToken_createdBy_idx`(`createdBy`),
    PRIMARY KEY (`token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecretGroup` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    INDEX `SecretGroup_meetingId_idx`(`meetingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SecretGroupMember` (
    `secretGroupId` VARCHAR(191) NOT NULL,
    `participantId` VARCHAR(191) NOT NULL,

    INDEX `SecretGroupMember_participantId_idx`(`participantId`),
    PRIMARY KEY (`secretGroupId`, `participantId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ZoomRoomDevice` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `roomId` VARCHAR(191) NOT NULL,
    `sipAddress` VARCHAR(191) NULL,
    `status` ENUM('invited', 'connected', 'disconnected') NOT NULL DEFAULT 'invited',

    INDEX `ZoomRoomDevice_meetingId_idx`(`meetingId`),
    INDEX `ZoomRoomDevice_roomId_idx`(`roomId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VoteTopic` (
    `id` VARCHAR(191) NOT NULL,
    `meetingId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `status` ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VoteTopic_meetingId_idx`(`meetingId`),
    INDEX `VoteTopic_createdBy_idx`(`createdBy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VoteOption` (
    `id` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `VoteOption_topicId_idx`(`topicId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VoteRecord` (
    `id` VARCHAR(191) NOT NULL,
    `topicId` VARCHAR(191) NOT NULL,
    `optionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `userName` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VoteRecord_optionId_idx`(`optionId`),
    INDEX `VoteRecord_userId_idx`(`userId`),
    UNIQUE INDEX `VoteRecord_topicId_userId_key`(`topicId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserCommittee` ADD CONSTRAINT `UserCommittee_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCommittee` ADD CONSTRAINT `UserCommittee_committeeId_fkey` FOREIGN KEY (`committeeId`) REFERENCES `Committee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Room` ADD CONSTRAINT `Room_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_bookedById_fkey` FOREIGN KEY (`bookedById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Meeting` ADD CONSTRAINT `Meeting_committeeId_fkey` FOREIGN KEY (`committeeId`) REFERENCES `Committee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Meeting` ADD CONSTRAINT `Meeting_organizerId_fkey` FOREIGN KEY (`organizerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingParticipant` ADD CONSTRAINT `MeetingParticipant_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingParticipant` ADD CONSTRAINT `MeetingParticipant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingFile` ADD CONSTRAINT `MeetingFile_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingAgendaItem` ADD CONSTRAINT `MeetingAgendaItem_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingAgendaItem` ADD CONSTRAINT `MeetingAgendaItem_secretGroupId_fkey` FOREIGN KEY (`secretGroupId`) REFERENCES `SecretGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgendaComment` ADD CONSTRAINT `AgendaComment_agendaItemId_fkey` FOREIGN KEY (`agendaItemId`) REFERENCES `MeetingAgendaItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingPermission` ADD CONSTRAINT `MeetingPermission_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MeetingPermission` ADD CONSTRAINT `MeetingPermission_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InviteToken` ADD CONSTRAINT `InviteToken_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InviteToken` ADD CONSTRAINT `InviteToken_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SecretGroup` ADD CONSTRAINT `SecretGroup_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SecretGroupMember` ADD CONSTRAINT `SecretGroupMember_secretGroupId_fkey` FOREIGN KEY (`secretGroupId`) REFERENCES `SecretGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SecretGroupMember` ADD CONSTRAINT `SecretGroupMember_participantId_fkey` FOREIGN KEY (`participantId`) REFERENCES `MeetingParticipant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZoomRoomDevice` ADD CONSTRAINT `ZoomRoomDevice_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZoomRoomDevice` ADD CONSTRAINT `ZoomRoomDevice_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoteTopic` ADD CONSTRAINT `VoteTopic_meetingId_fkey` FOREIGN KEY (`meetingId`) REFERENCES `Meeting`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoteTopic` ADD CONSTRAINT `VoteTopic_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoteOption` ADD CONSTRAINT `VoteOption_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `VoteTopic`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoteRecord` ADD CONSTRAINT `VoteRecord_topicId_fkey` FOREIGN KEY (`topicId`) REFERENCES `VoteTopic`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoteRecord` ADD CONSTRAINT `VoteRecord_optionId_fkey` FOREIGN KEY (`optionId`) REFERENCES `VoteOption`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoteRecord` ADD CONSTRAINT `VoteRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

