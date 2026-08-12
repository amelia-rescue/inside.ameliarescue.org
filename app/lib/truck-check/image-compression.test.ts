import { describe, expect, it } from "vitest";
import {
  getCompressedFileName,
  getScaledDimensions,
} from "./image-compression";

describe("getScaledDimensions", () => {
  it("leaves images smaller than the max dimension untouched", () => {
    expect(getScaledDimensions(800, 600, 2048)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("scales landscape images by their long edge", () => {
    expect(getScaledDimensions(4032, 3024, 2048)).toEqual({
      width: 2048,
      height: 1536,
    });
  });

  it("scales portrait images by their long edge", () => {
    expect(getScaledDimensions(3024, 4032, 2048)).toEqual({
      width: 1536,
      height: 2048,
    });
  });

  it("never scales an edge below one pixel", () => {
    expect(getScaledDimensions(10000, 1, 2048)).toEqual({
      width: 2048,
      height: 1,
    });
  });
});

describe("getCompressedFileName", () => {
  it("replaces the original extension with jpg", () => {
    expect(getCompressedFileName("IMG_0421.HEIC")).toBe("IMG_0421.jpg");
    expect(getCompressedFileName("photo.png")).toBe("photo.jpg");
  });

  it("appends an extension when the file has none", () => {
    expect(getCompressedFileName("photo")).toBe("photo.jpg");
  });

  it("keeps dots that are part of the name", () => {
    expect(getCompressedFileName("truck.8.rear.jpeg")).toBe("truck.8.rear.jpg");
  });

  it("falls back to a default name for extension-only files", () => {
    expect(getCompressedFileName(".heic")).toBe("photo.jpg");
  });
});
