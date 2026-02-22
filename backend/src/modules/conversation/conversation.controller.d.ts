import { Request, Response } from 'express';
export declare const initConversation: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const handleMessage: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
