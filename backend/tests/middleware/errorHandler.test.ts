import { errorHandler } from '../../src/middleware';

function run(err: unknown) {
  const res: any = { statusCode: 0, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (body: unknown) => ((res.body = body), res);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  errorHandler(err, {} as any, res, () => {});
  return res;
}

describe('errorHandler', () => {
  it('ซ่อนรายละเอียดของ error ภายใน (5xx) จาก client', () => {
    const res = run(new Error('connect ECONNREFUSED 10.0.0.5:3306'));
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Internal Server Error');
  });

  it('คงข้อความของ error ฝั่ง client (4xx) ไว้ รวมถึงจาก body-parser', () => {
    expect(run(Object.assign(new Error('ไม่มีสิทธิ์'), { statusCode: 403 })).body.error).toBe('ไม่มีสิทธิ์');
    const tooLarge = run(Object.assign(new Error('request entity too large'), { status: 413 }));
    expect(tooLarge.statusCode).toBe(413);
  });
});
