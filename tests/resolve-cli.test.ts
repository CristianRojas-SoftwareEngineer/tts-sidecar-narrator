// Resolución del binario tts-sidecar en el PATH, con la lógica condicional
// por SO (PATHEXT en Windows) que es fácil de romper sin notar desde una sola
// plataforma de desarrollo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { delimiter, join } from "node:path";
import { resolveCli, needsShell } from "../src/lib/resolve-cli.js";
import { fakePlatform, withEnv, makeTempDir, removeDir } from "./helpers.js";

function makeBinDir(...fileNames: string[]): string {
  const dir = makeTempDir("narrator-bin-");
  for (const name of fileNames) {
    writeFileSync(join(dir, name), "#!/bin/sh\n");
  }
  return dir;
}

test("POSIX: encuentra el binario tts-sidecar en el PATH", () => {
  const bin = makeBinDir("tts-sidecar");
  const restoreP = fakePlatform("linux");
  const restoreE = withEnv({ PATH: bin });
  try {
    assert.equal(resolveCli(), join(bin, "tts-sidecar"));
  } finally {
    restoreE();
    restoreP();
    removeDir(bin);
  }
});

test("POSIX: devuelve undefined si el CLI no está en el PATH", () => {
  const bin = makeBinDir();
  const restoreP = fakePlatform("linux");
  const restoreE = withEnv({ PATH: bin });
  try {
    assert.equal(resolveCli(), undefined);
  } finally {
    restoreE();
    restoreP();
    removeDir(bin);
  }
});

test("POSIX: respeta el orden del PATH", () => {
  const primero = makeBinDir("tts-sidecar");
  const segundo = makeBinDir("tts-sidecar");
  const restoreP = fakePlatform("linux");
  const restoreE = withEnv({ PATH: [primero, segundo].join(delimiter) });
  try {
    assert.equal(resolveCli(), join(primero, "tts-sidecar"));
  } finally {
    restoreE();
    restoreP();
    removeDir(primero);
    removeDir(segundo);
  }
});

test("POSIX: un directorio inexistente en el PATH no rompe la búsqueda", () => {
  const bin = makeBinDir("tts-sidecar");
  const restoreP = fakePlatform("linux");
  const restoreE = withEnv({
    PATH: [join(bin, "no-existe"), bin].join(delimiter),
  });
  try {
    assert.equal(resolveCli(), join(bin, "tts-sidecar"));
  } finally {
    restoreE();
    restoreP();
    removeDir(bin);
  }
});

test("Windows: resuelve el .exe respetando el orden de PATHEXT", () => {
  const bin = makeBinDir("tts-sidecar.exe", "tts-sidecar.cmd");
  const restoreP = fakePlatform("win32");
  const restoreE = withEnv({ PATH: bin, PATHEXT: ".EXE;.CMD;.BAT" });
  try {
    assert.equal(resolveCli(), join(bin, "tts-sidecar.exe"));
  } finally {
    restoreE();
    restoreP();
    removeDir(bin);
  }
});

test("Windows: encuentra el shim .cmd si no hay .exe", () => {
  const bin = makeBinDir("tts-sidecar.cmd");
  const restoreP = fakePlatform("win32");
  const restoreE = withEnv({ PATH: bin, PATHEXT: ".EXE;.CMD;.BAT" });
  try {
    assert.equal(resolveCli(), join(bin, "tts-sidecar.cmd"));
  } finally {
    restoreE();
    restoreP();
    removeDir(bin);
  }
});

test("Windows: usa las extensiones por defecto si PATHEXT falta", () => {
  const bin = makeBinDir("tts-sidecar.exe");
  const restoreP = fakePlatform("win32");
  const restoreE = withEnv({ PATH: bin, PATHEXT: undefined });
  try {
    assert.equal(resolveCli(), join(bin, "tts-sidecar.exe"));
  } finally {
    restoreE();
    restoreP();
    removeDir(bin);
  }
});

test("Windows: ignora entradas que son directorios, no archivos", () => {
  const bin = makeTempDir("narrator-bin-");
  mkdirSync(join(bin, "tts-sidecar.exe"));
  const restoreP = fakePlatform("win32");
  const restoreE = withEnv({ PATH: bin, PATHEXT: ".EXE" });
  try {
    assert.equal(resolveCli(), undefined);
  } finally {
    restoreE();
    restoreP();
    removeDir(bin);
  }
});

test("needsShell: true solo para shims .cmd/.bat en Windows", () => {
  const restoreP = fakePlatform("win32");
  try {
    assert.equal(needsShell("C:\\bin\\tts-sidecar.CMD"), true);
    assert.equal(needsShell("C:\\bin\\tts-sidecar.bat"), true);
    assert.equal(needsShell("C:\\bin\\tts-sidecar.exe"), false);
  } finally {
    restoreP();
  }
});

test("needsShell: siempre false fuera de Windows", () => {
  const restoreP = fakePlatform("linux");
  try {
    assert.equal(needsShell("/usr/bin/tts-sidecar.cmd"), false);
  } finally {
    restoreP();
  }
});
