import { z } from 'zod';

export const CreateFileActionSchema = z.object({
  action: z.literal('create_file'),
  path: z.string().describe('Relative path to the file from workspace root.'),
  content: z.string().describe('File content to write.'),
});

export const PatchFileActionSchema = z.object({
  action: z.literal('patch_file'),
  path: z.string().describe('Relative path to the file from workspace root.'),
  search: z.string().describe('Exact string to search for replacement.'),
  replace: z.string().describe('Exact string to replace the search string with.'),
});

export const DeleteFileActionSchema = z.object({
  action: z.literal('delete_file'),
  path: z.string().describe('Relative path to the file from workspace root.'),
});

export const RunCommandActionSchema = z.object({
  action: z.literal('run_command'),
  command: z.string().describe('Shell command to execute.'),
});

export const ActionSchema = z.discriminatedUnion('action', [
  CreateFileActionSchema,
  PatchFileActionSchema,
  DeleteFileActionSchema,
  RunCommandActionSchema,
]);

export type Action = z.infer<typeof ActionSchema>;
