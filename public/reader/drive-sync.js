// 메모를 구글 드라이브의 「이북리더기_메모」 폴더에 md 파일로 저장·병합하는 모듈.

import { buildMemoMarkdown, memoFileName, mergeMemos, parseMemoData } from './reader-core.js';

export const DRIVE_FOLDER_NAME = '이북리더기_메모';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_TYPE = 'application/vnd.google-apps.folder';

export class DriveError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const quote = value => `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

export function createDrive({ fetchImpl, token }) {
  async function call(url, options = {}) {
    const response = await fetchImpl(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!response.ok) throw new DriveError(response.status, `구글 드라이브 요청 실패 (${response.status})`);
    return response;
  }

  async function find(query) {
    const params = new URLSearchParams({ q: `${query} and trashed=false`, fields: 'files(id,name)', spaces: 'drive' });
    const { files } = await (await call(`${API}?${params}`)).json();
    return files[0]?.id || null;
  }

  return {
    findFolder: name => find(`name=${quote(name)} and mimeType=${quote(FOLDER_TYPE)}`),
    findFile: (name, folderId) => find(`name=${quote(name)} and ${quote(folderId)} in parents`),
    async createFolder(name) {
      const response = await call(`${API}?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ name, mimeType: FOLDER_TYPE }),
      });
      return (await response.json()).id;
    },
    async download(fileId) {
      return (await call(`${API}/${fileId}?alt=media`)).text();
    },
    async createFile(name, folderId, content) {
      const boundary = `ebook-reader-${Math.random().toString(36).slice(2)}`;
      const meta = JSON.stringify({ name, parents: [folderId], mimeType: 'text/markdown' });
      const body = [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
        `--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n`,
        content,
        `\r\n--${boundary}--`,
      ].join('');
      const response = await call(`${UPLOAD}?uploadType=multipart&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body,
      });
      return (await response.json()).id;
    },
    async updateFile(fileId, content) {
      await call(`${UPLOAD}/${fileId}?uploadType=media&fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'text/markdown; charset=UTF-8' },
        body: content,
      });
    },
  };
}

// 드라이브의 메모 파일을 읽어 병합한 뒤 다시 쓴다. 다른 기기에서 쓴 메모도 남는다.
export async function syncBookMemos({ drive, book, folderId = null, fileId = null, now }) {
  const name = memoFileName(book.title);
  folderId ||= (await drive.findFolder(DRIVE_FOLDER_NAME)) || (await drive.createFolder(DRIVE_FOLDER_NAME));
  fileId ||= await drive.findFile(name, folderId);
  let { memos } = book;
  if (fileId) {
    try {
      const remote = parseMemoData(await drive.download(fileId));
      if (remote) memos = mergeMemos(memos, remote.memos);
    } catch (error) {
      if (error.status !== 404) throw error;
      fileId = null;
    }
  }
  const content = buildMemoMarkdown({ ...book, memos, now });
  if (fileId) await drive.updateFile(fileId, content);
  else fileId = await drive.createFile(name, folderId, content);
  return { folderId, fileId, memos };
}
