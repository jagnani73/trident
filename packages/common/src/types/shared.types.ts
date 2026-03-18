import type { AppErrorPublic } from "../errors";

export type ResponseWithData<T> =
    | {
          success: true;
          data: T;
      }
    | {
          success: false;
          data: AppErrorPublic;
      };

export type Hex = `0x${string}`;
