// Basit dokunmatik/mouse sanal joystick - DJI Fly'daki gibi çift çubuk.
export class Joystick {
  constructor(baseEl, stickEl, { returnX = true, returnY = true } = {}) {
    this.baseEl = baseEl;
    this.stickEl = stickEl;
    this.returnX = returnX;
    this.returnY = returnY;
    this.x = 0; // -1..1
    this.y = 0; // -1..1
    this.active = false;
    this.pointerId = null;
    this.radius = 0;
    this._bind();
  }

  _bind() {
    const start = (e) => {
      this.active = true;
      this.pointerId = e.pointerId;
      try { this.baseEl.setPointerCapture(e.pointerId); } catch (err) { /* dokunmatik olmayan/sentetik olaylarda yoksayılır */ }
      this._update(e);
    };
    const move = (e) => {
      if (!this.active || e.pointerId !== this.pointerId) return;
      this._update(e);
    };
    const end = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.active = false;
      this.pointerId = null;
      if (this.returnX) this.x = 0;
      if (this.returnY) this.y = 0;
      this._render();
    };
    this.baseEl.addEventListener("pointerdown", start);
    this.baseEl.addEventListener("pointermove", move);
    this.baseEl.addEventListener("pointerup", end);
    this.baseEl.addEventListener("pointercancel", end);
  }

  _update(e) {
    const rect = this.baseEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const r = rect.width / 2;
    let dx = (e.clientX - cx) / r;
    let dy = (e.clientY - cy) / r;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    this.x = this.returnX === "hold-only" ? this.x : dx;
    this.y = -dy; // yukarı = pozitif
    this._render();
  }

  _render() {
    const r = this.baseEl.getBoundingClientRect().width / 2 - this.stickEl.getBoundingClientRect().width / 2;
    this.stickEl.style.transform = `translate(${this.x * r}px, ${-this.y * r}px)`;
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this._render();
  }
}
