// R2 / Worker 相关的共享类型定义
// 之前 R2FileManager / R2ImageManager / MarkdownViewer / NotesManager 各自重复定义，
// 现统一在此，确保响应结构变更时只需改一处。

/** Worker 连接配置（存于 localStorage 的 r2_config / r2_image_config） */
export interface Config {
  workerUrl: string;
  apiToken: string;
}

/** R2 对象列表中的单个文件项（Worker list 接口返回） */
export interface FileItem {
  Key: string;
  Size: number;
  LastModified: string;
  ETag?: string;
}
