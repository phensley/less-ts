import { Buffer, Node, NodeType } from '../common';
import { Anonymous } from './general';
import { hexchar, hexToRGB, nameToRGB, rgbToName } from '../utils';

export const enum Colorspace {
  RGB = 0,
  HSL = 1
}

export abstract class BaseColor extends Node {

  constructor() {
    super(NodeType.COLOR);
  }

  abstract colorspace(): Colorspace;

  abstract toRGB(): RGBColor;

  abstract toHSL(): HSLColor;

  static fromHex(raw: string): RGBColor {
    const [r, g, b] = hexToRGB(raw);
    return new RGBColor(r, g, b, 1.0);
  }
}

export class RGBColor extends BaseColor {

  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;

  protected _forceHex: boolean = false;

  constructor(r: number, g: number, b: number, a: number) {
    super();
    this.r = chan(r);
    this.g = chan(g);
    this.b = chan(b);
    this.a = clamp(a, 0, 1.0);
  }

  equals(n: Node): boolean {
    if (n instanceof RGBColor) {
      const o = n as RGBColor;
      return this.r === o.r
          && this.g === o.g
          && this.b === o.b
          && this.a === o.a;
    }
    return false;
  }

  luma(): number {
    return (0.2126 * (this.r / 255) + 0.7152 * (this.g / 255) + 0.0722 * (this.b / 255)) * this.a;
  }

  repr(buf: Buffer): void {
    const { r, g, b, a } = this;
    if (a < 1.0) {
      const { listsep } = buf.chars;
      buf.str('rgba(');
      buf.num(r).str(listsep);
      buf.num(g).str(listsep);
      buf.num(b).str(listsep);
      buf.num(a);
      buf.str(')');
      return;
    }

    // Get hex components
    const r0 = hexchar(r >> 4);
    const r1 = hexchar(r & 0x0F);
    const g0 = hexchar(g >> 4);
    const g1 = hexchar(g & 0x0F);
    const b0 = hexchar(b >> 4);
    const b1 = hexchar(b & 0x0F);

    // See if we can represent this as a 3-character hex color
    const hex3 = buf.fastcolor && r0 === r1 && g0 === g1 && b0 === b1;

    // If we aren't forcing a hex value here, try to outut a name if
    // if is shorter than the hex representation.
    if (!this._forceHex && !buf.fastcolor) {
      const name = rgbToName(r, g, b);
      if (name) {
        const len = name.length;
        if ((hex3 && len <= 4) || (!hex3 && len <= 7)) {
          buf.str(name);
          return;
        }
        // Fall through
      }
    }

    buf.str('#');
    if (hex3) {
      buf.str(r0).str(g0).str(b0);
    } else {
      buf.str(r0).str(r1);
      buf.str(g0).str(g1);
      buf.str(b0).str(b1);
    }
  }

  colorspace(): Colorspace {
    return Colorspace.RGB;
  }

  forceHex(): void {
    this._forceHex = true;
  }

  toRGB(): RGBColor {
    return this;
  }

  toARGB(): Anonymous {
    const { r, g, b } = this;
    const a = Math.round(this.a * 255) | 0;
    const s = `#${hexchar(a >> 4)}${hexchar(a & 0x0F)}`
          + `${hexchar(r >> 4)}${hexchar(r & 0x0F)}`
          + `${hexchar(g >> 4)}${hexchar(g & 0x0F)}`
          + `${hexchar(b >> 4)}${hexchar(b & 0x0F)}`;
    return new Anonymous(s);
  }

  toHSL(): HSLColor {
    const r = this.r / 255;
    const g = this.g / 255;
    const b = this.b / 255;
    const max = Math.max(Math.max(r, g), b);
    const min = Math.min(Math.min(r, g), b);
    const d = max - min;
    const l = (max + min) / 2.0;
    let h = 0;
    let s = 0;

    if (max !== min) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if ((max - r) === 0) {
        h = (g - b) / d + (g < b ? 6 : 0);
      } else if ((max - g) === 0) {
        h = (b - r) / d + 2;
      } else if ((max - b) === 0) {
        h = (r - g) / d + 4;
      }
      h /= 6.0;
    }
    return new HSLColor(h, s, l, this.a);
  }
}

export class HSLColor extends BaseColor {

  constructor(readonly h: number, readonly s: number, readonly l: number, readonly a: number) {
    super();
  }

  equals(n: Node): boolean {
    if (n instanceof HSLColor) {
      const o = n as HSLColor;
      return this.h === o.h
          && this.s === o.s
          && this.l === o.l
          && this.a === o.a;
    }
    return false;
  }

  repr(buf: Buffer): void {
    this.toRGB().repr(buf);
  }

  colorspace(): Colorspace {
    return Colorspace.HSL;
  }

  toRGB(): RGBColor {
    let r = 0;
    let g = 0;
    let b = 0;
    if (this.s === 0) {
      r = g = b = this.l;
    } else {
      const h = this.h / 360.0;
      const { l, s } = this;
      const q = l < 0.5 ? (l * (1 + s)) : (l + s - l * s);
      const p = 2 * l - q;
      r = hue(p, q, h + 1 / 3.0);
      g = hue(p, q, h);
      b = hue(p, q, h - 1 / 3.0);
    }
    return new RGBColor(r * 255, g * 255, b * 255, this.a);
  }

  toHSL(): HSLColor {
    return this;
  }
}

const hue = (p: number, q: number, h: number): number => {
  if (h < 0) {
    h += 1.0;
  }
  if (h > 1) {
    h -= 1.0;
  }
  if (h < 1 / 6.0) {
    return p + (q - p) * 6.0 * h;
  }
  if (h < 1 / 2.0) {
    return q;
  }
  if (h < 2 / 3.0) {
    return p + (q - p) * ((2 / 3.0) - h) * 6.0;
  }
  return p;
};

export class KeywordColor extends RGBColor {

  constructor(readonly keyword: string, r: number, g: number, b: number) {
    super(r, g, b, 1.0);
  }

  repr(buf: Buffer): void {
    buf.str(this.keyword);
  }
}

export const colorFromName = (name: string): RGBColor | undefined => {
  if (name === 'transparent') {
    return new KeywordColor(name, 0, 0, 0);
  }
  const c = nameToRGB(name);
  return c ? new RGBColor(c[0], c[1], c[2], 1.0) : undefined;
};

const chan = (n: number): number => clamp(n, 0, 255);

const clamp = (n: number, lo: number, hi: number): number =>
   Math.min(hi, Math.max(n, lo));
