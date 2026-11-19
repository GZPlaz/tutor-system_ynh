/**
 * Free study packets: PDFs (or Word files) anyone can download from /packets
 * without an account. Admins with `packets:manage` upload and organise them.
 *
 * Public visibility rule: isPublished = true. Everything else is admin-only,
 * and an unpublished packet answers 404 publicly (it doesn't reveal it exists).
 */
import { prisma } from '../../lib/prisma.js';
import { NotFound } from '../../lib/errors.js';
import { audit } from '../audit/audit.service.js';
import { removeFile } from '../resources/storage.js';

type Auth = Express.AuthContext;

/** Only these fields ever leave the server on the public endpoints. */
const publicSelect = {
  id: true,
  title: true,
  description: true,
  subject: true,
  pageCount: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  updatedAt: true,
} as const;

const order = [{ subject: 'asc' as const }, { sortOrder: 'asc' as const }, { title: 'asc' as const }];

export function listPublished() {
  return prisma.studyPacket.findMany({ where: { isPublished: true }, select: publicSelect, orderBy: order });
}

/** Looks up a published packet for download and counts the download. */
export async function openPublished(id: string) {
  const p = await prisma.studyPacket.findFirst({ where: { id, isPublished: true } });
  if (!p) throw NotFound('Packet');
  await prisma.studyPacket.update({ where: { id }, data: { downloadCount: { increment: 1 } } });
  return p;
}

export function listAll() {
  return prisma.studyPacket.findMany({
    orderBy: order,
    include: { createdBy: { select: { firstName: true, lastName: true } } },
  });
}

export interface PacketFile {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PacketFields {
  title: string;
  description?: string | null;
  subject: string;
  pageCount?: number | null;
  isPublished: boolean;
  sortOrder: number;
}

export async function createPacket(auth: Auth, input: PacketFields & { file: PacketFile }) {
  const { file, ...fields } = input;
  const p = await prisma.studyPacket.create({ data: { ...fields, ...file, createdById: auth.userId } });
  await audit(auth.userId, 'packet.created', 'study_packet', p.id, { title: p.title, subject: p.subject });
  return p;
}

/** Edits details; when `file` is given the old file is replaced (and removed from disk). */
export async function updatePacket(auth: Auth, id: string, data: Partial<PacketFields>, file?: PacketFile) {
  const before = await prisma.studyPacket.findUnique({ where: { id } });
  if (!before) throw NotFound('Packet');
  const p = await prisma.studyPacket.update({ where: { id }, data: { ...data, ...file } });
  if (file) await removeFile(before.storageKey);
  await audit(auth.userId, 'packet.updated', 'study_packet', id, { ...data, fileReplaced: !!file });
  return p;
}

export async function deletePacket(auth: Auth, id: string) {
  const p = await prisma.studyPacket.findUnique({ where: { id } });
  if (!p) throw NotFound('Packet');
  await prisma.studyPacket.delete({ where: { id } });
  await removeFile(p.storageKey);
  await audit(auth.userId, 'packet.deleted', 'study_packet', id, { title: p.title });
}
