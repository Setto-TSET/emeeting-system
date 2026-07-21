"use client";

import { Button } from "@/components/ui/button";
import { MeetingFile } from "@/data";

// ==========================================
// Simulated Premium Document Page Viewer Component
// (Renders realistic PDF slides and financial worksheets)
// ผู้เข้าร่วมดูได้อย่างเดียว — ไม่มีปุ่มดาวน์โหลด
// ==========================================
type DocViewerProps = {
  file: MeetingFile;
  currentPage: number;
  setCurrentPage: (p: number) => void;
  zoom: number;
  setZoom: (z: number) => void;
};

export function SimulatedDocumentViewer({ file, currentPage, setCurrentPage, zoom, setZoom }: DocViewerProps) {
  const isFinance = file.name.toLowerCase().includes("งบ") || file.name.toLowerCase().includes("financial");
  const isOrg = file.name.toLowerCase().includes("โครงสร้าง") || file.name.toLowerCase().includes("org");
  const totalPages = isFinance ? 2 : isOrg ? 3 : 5;

  const page = Math.min(currentPage, totalPages);

  return (
    <div className="flex-1 flex flex-col items-center justify-between min-h-0 space-y-4">
      {/* Zoom and Page controls */}
      <div className="w-full bg-muted px-4 py-2 rounded-xl border flex items-center justify-between gap-4 text-xs shrink-0 select-none">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setCurrentPage(Math.max(1, page - 1))}
            disabled={page === 1}
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </Button>
          <span className="text-foreground font-semibold">
            หน้า {page} / {totalPages}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setZoom(Math.max(50, zoom - 25))}
            disabled={zoom === 50}
          >
            <span className="material-symbols-outlined text-[16px]">zoom_out</span>
          </Button>
          <span className="text-[11px] font-semibold text-foreground">{zoom}%</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setZoom(Math.min(200, zoom + 25))}
            disabled={zoom === 200}
          >
            <span className="material-symbols-outlined text-[16px]">zoom_in</span>
          </Button>
        </div>
      </div>

      {/* Simulated Document Canvas Sheet */}
      <div className="flex-1 w-full flex items-center justify-center p-2 min-h-0 overflow-auto">
        <div
          style={{ transform: `scale(${zoom / 100})`, transformOrigin: "center center" }}
          className="w-full max-w-[650px] aspect-[4/3] bg-white text-slate-900 p-8 rounded-xl shadow-2xl flex flex-col transition-all duration-200 select-none"
        >
          {isFinance ? (
            /* Render Spreadsheet mock layout */
            <div className="flex-1 flex flex-col h-full">
              <div className="border-b-2 border-slate-300 pb-2 mb-4">
                <h3 className="font-bold text-base text-slate-800">งบการเงินและการวิเคราะห์งบประมาณไตรมาส 2/2569</h3>
                <p className="text-[10px] text-slate-500">รายงานประกอบการพิจารณาวาระการประชุมผู้บริหารระดับสูง</p>
              </div>

              {page === 1 ? (
                <div className="flex-grow flex flex-col text-xs">
                  <p className="font-semibold text-slate-700 mb-2">ตารางที่ 1: รายการอนุมัติงบประมาณและเบิกจ่ายจริงสะสม (หน่วย: ล้านบาท)</p>
                  <table className="w-full text-left border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-100 font-bold text-slate-700">
                        <th className="border border-slate-200 p-1.5">แผนก/โครงการ</th>
                        <th className="border border-slate-200 p-1.5 text-right">งบประมาณ</th>
                        <th className="border border-slate-200 p-1.5 text-right">เบิกจ่ายจริง</th>
                        <th className="border border-slate-200 p-1.5 text-right">คงเหลือ</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-200 p-1.5 font-medium">1. พัฒนาระบบ e-Office</td>
                        <td className="border border-slate-200 p-1.5 text-right text-slate-600">5.50</td>
                        <td className="border border-slate-200 p-1.5 text-right text-green-700">4.80</td>
                        <td className="border border-slate-200 p-1.5 text-right text-slate-600">0.70</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 p-1.5 font-medium">2. จัดซื้ออุปกรณ์แม่ข่าย</td>
                        <td className="border border-slate-200 p-1.5 text-right text-slate-600">3.20</td>
                        <td className="border border-slate-200 p-1.5 text-right text-green-700">3.20</td>
                        <td className="border border-slate-200 p-1.5 text-right text-slate-600">0.00</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 p-1.5 font-medium">3. พัฒนาบุคลากรไอที</td>
                        <td className="border border-slate-200 p-1.5 text-right text-slate-600">1.80</td>
                        <td className="border border-slate-200 p-1.5 text-right text-green-700">1.10</td>
                        <td className="border border-slate-200 p-1.5 text-right text-slate-600">0.70</td>
                      </tr>
                      <tr className="bg-slate-50 font-bold">
                        <td className="border border-slate-200 p-1.5">รวมโครงการเทคโนโลยี</td>
                        <td className="border border-slate-200 p-1.5 text-right">10.50</td>
                        <td className="border border-slate-200 p-1.5 text-right">9.10</td>
                        <td className="border border-slate-200 p-1.5 text-right text-rose-600">1.40</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 leading-normal">
                    <strong>ข้อสังเกตฝ่ายบัญชี:</strong> โครงการพัฒนาระบบ e-Office เฟส 1 มีการเบิกจ่ายไปแล้ว 87% มีแผนจะปิดโครงการภายในเดือนหน้า ส่วนฝ่ายพัฒนาบุคลากรเหลือยอดโอนจ่ายรอบการเข้าเทรนนิ่งเพิ่มเติม
                  </div>
                </div>
              ) : (
                <div className="flex-grow flex flex-col text-xs">
                  <p className="font-semibold text-slate-700 mb-2">ตารางที่ 2: ข้อเสนอขอจัดตั้งงบประมาณเพิ่มเติม Q3 (หน่วย: ล้านบาท)</p>
                  <table className="w-full text-left border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-100 font-bold text-slate-700">
                        <th className="border border-slate-200 p-1.5">รายการเสนออนุมัติ</th>
                        <th className="border border-slate-200 p-1.5 text-right">งบประมาณเสนอ</th>
                        <th className="border border-slate-200 p-1.5 text-right">แหล่งงบเดิม</th>
                        <th className="border border-slate-200 p-1.5">ความจำเป็นเร่งด่วน</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-slate-200 p-1.5 font-medium">1. ขยายคู่สายประชุมและเครือข่าย</td>
                        <td className="border border-slate-200 p-1.5 text-right text-slate-600">0.45</td>
                        <td className="border border-slate-200 p-1.5 text-right">งบสำรองฉุกเฉิน</td>
                        <td className="border border-slate-200 p-1.5 text-slate-600">ระดับกลาง (เพื่อรองรับ Hybrid)</td>
                      </tr>
                      <tr>
                        <td className="border border-slate-200 p-1.5 font-medium">2. อัปเกรดระบบรักษาความปลอดภัย Web App</td>
                        <td className="border border-slate-200 p-1.5 text-right text-slate-600">0.85</td>
                        <td className="border border-slate-200 p-1.5 text-right">งบไอทีกลางปี</td>
                        <td className="border border-slate-200 p-1.5 text-slate-600">ระดับสูง (ผ่านเกณฑ์ Audit)</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-[10px] text-slate-500 mt-4 italic">หมายเหตุ: เสนอที่ประชุมคณะทำงานพิจารณาลงมติและแจ้งความเห็นชอบ</p>
                </div>
              )}
            </div>
          ) : isOrg ? (
            /* Render Org Layout Chart */
            <div className="flex-1 flex flex-col h-full">
              <div className="border-b-2 border-slate-300 pb-2 mb-4">
                <h3 className="font-bold text-base text-slate-800">โครงสร้างและผังการจัดรูปส่วนงานใหม่ 2569</h3>
                <p className="text-[10px] text-slate-500">เอกสารลับระดับผู้บริหาร - ห้ามทำซ้ำหรือนำออกภายนอก</p>
              </div>

              {page === 1 ? (
                <div className="flex-grow flex flex-col justify-center items-center text-xs">
                  <p className="font-semibold text-slate-700 mb-6">ภาพโครงสร้างรวมขององค์กร (Proposed Structure)</p>

                  {/* Visual flowchart chart simulated */}
                  <div className="space-y-4 w-full max-w-sm">
                    <div className="bg-rose-50 border-2 border-rose-600 text-rose-800 font-bold p-2 text-center rounded-xl shadow-sm">
                      ผู้อำนวยการ (Director)
                    </div>
                    <div className="flex justify-between gap-6">
                      <div className="flex-1 bg-blue-50 border-2 border-blue-600 text-blue-800 font-medium p-2 text-center rounded-xl shadow-xs">
                        ฝ่ายเทคโนโลยีไอที
                      </div>
                      <div className="flex-1 bg-emerald-50 border-2 border-emerald-600 text-emerald-800 font-medium p-2 text-center rounded-xl shadow-xs">
                        ฝ่ายยุทธศาสตร์/บัญชี
                      </div>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-8 italic">* สรุปการย้ายสายการรายงานตรงไปยังคณะกรรมการใหญ่</p>
                </div>
              ) : page === 2 ? (
                <div className="flex-grow flex flex-col text-xs justify-center items-center text-center">
                  <p className="font-semibold text-slate-700 mb-3 text-left w-full">การจัดอัตรากำลังกำลังพลในฝ่ายไอที</p>
                  <div className="border border-slate-200 rounded p-4 w-full bg-slate-50 space-y-2 text-left">
                    <p className="text-slate-700"><strong>1. ทีมซอฟต์แวร์ (e-Office Development):</strong> เพิ่มสัญญารับเหมาช่วง 2 ราย</p>
                    <p className="text-slate-700"><strong>2. ทีมวิเคราะห์ระบบความปลอดภัย:</strong> ย้ายพนักงานจากกองสนับสนุน 1 ราย</p>
                    <p className="text-slate-700"><strong>3. เจ้าหน้าที่แอดมินระบบ:</strong> รับทดแทนตำแหน่งว่างเดิม 1 ราย</p>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-4 italic">แผนภาพละเอียดอยู่ในหน้าถัดไป</p>
                </div>
              ) : (
                <div className="flex-grow flex flex-col text-xs justify-center items-center text-center">
                  <p className="font-semibold text-slate-700 mb-3">เปรียบเทียบค่าใช้จ่ายหลังปรับผัง (ล้านบาท/ปี)</p>
                  <div className="w-full max-w-xs space-y-2 text-left">
                    <div className="flex justify-between border-b pb-1">
                      <span>โครงสร้างเดิม:</span>
                      <span className="font-semibold">24.50</span>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                      <span>โครงสร้างที่เสนอ:</span>
                      <span className="font-semibold text-green-700">22.80</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-800 pt-1">
                      <span>ประหยัดได้สุทธิ:</span>
                      <span className="text-rose-600">1.70 (ลดลง 6.9%)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Standard document mock rendering */
            <div className="flex-1 flex flex-col h-full justify-between">
              <div>
                <div className="border-b border-slate-200 pb-2 mb-4">
                  <h3 className="font-bold text-sm text-slate-800">{file.name}</h3>
                  <p className="text-[9px] text-slate-400">ระเบียบและเอกสารประกอบการประชุม</p>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  นี่คือการจำลองการอ่านหน้าเอกสารประกอบการประชุม หน้าที่ {page} จาก {totalPages}
                  หน้า ข้อมูลในไฟล์แสดงเนื้อหา วาระ มติที่เกี่ยวข้อง และรายละเอียดโครงการอย่างครบถ้วน
                  ผู้เข้าร่วมสามารถอ่านเอกสารได้จากหน้าเว็บนี้โดยตรง โดยไม่ต้องดาวน์โหลดไฟล์ออกนอกระบบ
                </p>
                <div className="mt-4 p-4 border border-dashed border-slate-200 rounded bg-slate-50 text-[10px] text-slate-500">
                  <p className="font-semibold text-slate-700 mb-1">เนื้อหาย่อหน้าสำคัญ:</p>
                  1. ขอให้องค์ประชุมรวบรวมข้อเสนอแนะส่งกลับเลขานุการภายใน 3 วันทำการ<br />
                  2. ให้ประธานและรองประธานมีอำนาจสั่งการเบิกจ่ายตามกรอบอำนาจปัจจุบัน
                </div>
              </div>
              <div className="text-[9px] text-slate-400 text-center">e-Meeting &copy; 2026. All rights reserved.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Lightbox wrapper — เปิดอ่านเอกสารเต็มจอ (อ่านอย่างเดียว)
// ==========================================
type DocumentLightboxProps = {
  file: MeetingFile;
  onClose: () => void;
  currentPage: number;
  setCurrentPage: (p: number) => void;
  zoom: number;
  setZoom: (z: number) => void;
};

export function DocumentLightbox({ file, onClose, currentPage, setCurrentPage, zoom, setZoom }: DocumentLightboxProps) {
  return (
    <div className="fixed inset-0 z-[2000] bg-foreground/50 backdrop-blur-sm flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-4xl h-[85vh] bg-card border border-border rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        {/* Lightbox header */}
        <div className="h-14 bg-muted px-6 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-primary">menu_book</span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground truncate">{file.name}</h3>
              <p className="text-[10px] text-muted-foreground truncate">{file.description || "เอกสารประกอบการประชุม"}</p>
            </div>
          </div>

          <Button
            onClick={onClose}
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted"
            size="icon"
          >
            <span className="material-symbols-outlined">close</span>
          </Button>
        </div>

        {/* Viewer canvas — พื้นเทาให้แผ่นเอกสารสีขาวเด่นขึ้นมา */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col justify-between bg-muted/60">
          <SimulatedDocumentViewer
            file={file}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            zoom={zoom}
            setZoom={setZoom}
          />
        </div>

        {/* Viewer footer — อ่านอย่างเดียว ไม่มีดาวน์โหลด */}
        <div className="h-12 border-t border-border bg-muted px-6 flex items-center justify-between shrink-0 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] text-muted-foreground">visibility</span>
            อ่านได้จากหน้าเว็บเท่านั้น · ผู้จัดทำ: {file.uploadedBy}
          </span>
          <Button onClick={onClose} size="sm" className="bg-secondary hover:bg-secondary/80 text-secondary-foreground">
            ปิดการอ่าน
          </Button>
        </div>
      </div>
    </div>
  );
}
