// AudioWorkletProcessor — ส่งบล็อกเสียงดิบกลับไปที่ main thread
// ตรรกะการตัดก้อนและกรองเสียงเงียบอยู่ที่ audioCapture.ts เพื่อให้ทดสอบได้โดยไม่ต้องมี AudioContext
class PcmCollector extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      this.port.postMessage(new Float32Array(channel));
    }
    return true;
  }
}

registerProcessor('pcm-collector', PcmCollector);
