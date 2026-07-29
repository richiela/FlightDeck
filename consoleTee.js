/**
 * Mirror console + stdout/stderr to a rotating log file (tee).
 * Writes sync on every console.* call so `tail -f` works under Docker pipes
 * (where Node may buffer stdout and delay stdout.write).
 * When the file exceeds maxBytes, keep the trailing keepBytes.
 */
const fs = require('fs');
const path = require('path');
const util = require('util');

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_KEEP_BYTES = 5 * 1024 * 1024;

function installConsoleTee(opts = {}) {
    const logPath = opts.logPath
        || path.join(__dirname, 'data', 'server.log');
    const maxBytes = Number(opts.maxBytes) > 0 ? Number(opts.maxBytes) : DEFAULT_MAX_BYTES;
    const keepBytes = Math.min(
        Number(opts.keepBytes) > 0 ? Number(opts.keepBytes) : DEFAULT_KEEP_BYTES,
        maxBytes
    );

    try {
        const dir = path.dirname(logPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[LOG] cannot create log dir:', err.message);
        return { ok: false, error: err.message };
    }

    let fd = null;
    let trimming = false;
    let fromConsole = false;
    let bytesSinceSync = 0;
    const FSYNC_EVERY = 4096;

    function openLog() {
        if (fd != null) {
            try { fs.closeSync(fd); } catch (_) {}
            fd = null;
        }
        fd = fs.openSync(logPath, 'a');
    }

    openLog();

    function maybeTrim() {
        if (trimming || fd == null) return;
        try {
            const size = fs.fstatSync(fd).size;
            if (size <= maxBytes) return;
            trimming = true;
            try { fs.closeSync(fd); } catch (_) {}
            fd = null;

            const readFd = fs.openSync(logPath, 'r');
            let slice;
            try {
                const st = fs.fstatSync(readFd);
                const start = Math.max(0, st.size - keepBytes);
                const buf = Buffer.alloc(st.size - start);
                fs.readSync(readFd, buf, 0, buf.length, start);
                slice = buf;
                const nl = buf.indexOf(0x0a);
                if (nl >= 0 && nl + 1 < buf.length) slice = buf.subarray(nl + 1);
            } finally {
                try { fs.closeSync(readFd); } catch (_) {}
            }
            fs.writeFileSync(logPath, slice);
            openLog();
        } catch (err) {
            try { if (fd == null) openLog(); } catch (_) {}
            try {
                if (fd != null) {
                    fs.writeSync(fd, `\n[LOG] trim failed: ${err.message}\n`);
                }
            } catch (_) {}
        } finally {
            trimming = false;
        }
    }

    function append(chunk, encoding) {
        try {
            if (fd == null) openLog();
            const text = Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(String(chunk), encoding || 'utf8');
            if (!text.length) return;
            fs.writeSync(fd, text);
            bytesSinceSync += text.length;
            // Flush often enough that tail -f / NAS mounts see updates promptly
            if (bytesSinceSync >= FSYNC_EVERY) {
                fs.fsyncSync(fd);
                bytesSinceSync = 0;
            }
            maybeTrim();
        } catch (_) {
            /* ignore disk errors — console still works */
        }
    }

    function wrapStream(stream) {
        const orig = stream.write.bind(stream);
        stream.write = (chunk, encoding, cb) => {
            if (typeof encoding === 'function') {
                cb = encoding;
                encoding = undefined;
            }
            // console.* already appended — skip duplicate from the underlying write
            if (!fromConsole) append(chunk, encoding);
            return orig(chunk, encoding, cb);
        };
    }

    wrapStream(process.stdout);
    wrapStream(process.stderr);

    // Direct console hooks: fire even when stdout is pipe-buffered (Docker/nodemon)
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
        const orig = console[method].bind(console);
        console[method] = (...args) => {
            try {
                append(`${util.format(...args)}\n`);
            } catch (_) {}
            fromConsole = true;
            try {
                return orig(...args);
            } finally {
                fromConsole = false;
            }
        };
    }

    append(`\n----- FlightDeck log start ${new Date().toISOString()} -----\n`);
    try { fs.fsyncSync(fd); } catch (_) {}
    return { ok: true, logPath, maxBytes, keepBytes };
}

module.exports = { installConsoleTee };
