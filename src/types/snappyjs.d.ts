declare module 'snappyjs' {
  export function compress(buffer: ArrayBuffer): ArrayBuffer;
  export function uncompress(buffer: ArrayBuffer): ArrayBuffer;
}