/**
 * `showOpenFilePicker` (File System Access API) is missing from this project's
 * bundled TypeScript DOM lib version — everything else it returns
 * (FileSystemFileHandle, createWritable, etc.) is already declared there.
 * Chrome/Edge-only; feature-detected at runtime via `"showOpenFilePicker" in window`.
 */
interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
}

interface Window {
  showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}
