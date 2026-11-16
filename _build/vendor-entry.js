import Anthropic from "@anthropic-ai/sdk";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
window.Vendor = { Anthropic, BrowserMultiFormatReader, BarcodeFormat, DecodeHintType };
