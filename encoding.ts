export interface EncoderDecoder {
  encode<T = unknown>(data: T): string;
  decode<T = unknown>(s: string): T;
}

export class Json implements EncoderDecoder {
  encode<T = unknown>(data: T): string {
    return JSON.stringify(data);
  }
  decode<T = unknown>(s: string): T {
    return JSON.parse(s);
  }
}
