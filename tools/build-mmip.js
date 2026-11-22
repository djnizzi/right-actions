#!/usr/bin/env node
'use strict';

/*
 * Packages RightActions.mmip from the add-on sources.
 *
 *   node "Right Actions/tools/build-mmip.js"
 *
 * The archive is built from a temporary copy, then opened again and checked
 * entry by entry, so a package that silently drops a file fails here instead
 * of installing cleanly and then running the previous version's code.
 */

var fs = require('fs');
var os = require('os');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

var ROOT = path.resolve(__dirname, '..');
var OUTPUT = path.join(ROOT, 'RightActions.mmip');

/* Everything the add-on needs; the archive holds these at its root. */
var ENTRIES = [
    'info.json',
    'init.js',
    'rightActions.js',
    'skin/icon/rightActions.svg'
];

function copyInto(from, to) {
    if (fs.statSync(from).isDirectory()) {
        fs.mkdirSync(to, { recursive: true });
        fs.readdirSync(from).forEach(function (name) {
            copyInto(path.join(from, name), path.join(to, name));
        });
        return;
    }

    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}

/**
 * The archive's central directory: names normalised to `/`, mapped to the
 * uncompressed size of each file. Reading it here keeps the check free of a zip
 * dependency, and it reads both `zip` and Compress-Archive output, which differ
 * in the separator they write.
 */
function archiveEntries(file) {
    var buffer = fs.readFileSync(file);
    var end = -1;

    for (var i = buffer.length - 22; i >= 0 && i >= buffer.length - 65557; i--) {
        if (buffer.readUInt32LE(i) === 0x06054b50) { end = i; break; }
    }

    if (end < 0) throw new Error('Not a zip archive: ' + path.basename(file));

    var count = buffer.readUInt16LE(end + 10);
    var at = buffer.readUInt32LE(end + 16);
    var entries = {};

    for (var index = 0; index < count; index++) {
        if (buffer.readUInt32LE(at) !== 0x02014b50) {
            throw new Error('Damaged central directory in ' + path.basename(file));
        }

        var nameLength = buffer.readUInt16LE(at + 28);
        var extraLength = buffer.readUInt16LE(at + 30);
        var commentLength = buffer.readUInt16LE(at + 32);
        var name = buffer.toString('utf8', at + 46, at + 46 + nameLength);

        entries[name.replace(/\\/g, '/')] = buffer.readUInt32LE(at + 24);
        at += 46 + nameLength + extraLength + commentLength;
    }

    return entries;
}

/** Every file in the staging folder, relative and `/` separated, with its size. */
function stagedFiles(directory, prefix) {
    var files = [];

    fs.readdirSync(directory).forEach(function (name) {
        var full = path.join(directory, name);
        var relative = prefix ? prefix + '/' + name : name;

        if (fs.statSync(full).isDirectory()) files = files.concat(stagedFiles(full, relative));
        else files.push({ name: relative, size: fs.statSync(full).size });
    });

    return files;
}

function verifyArchive(file, staging) {
    var entries = archiveEntries(file);
    var files = stagedFiles(staging, '');
    var missing = [];
    var mismatched = [];

    files.forEach(function (entry) {
        if (!Object.prototype.hasOwnProperty.call(entries, entry.name)) missing.push(entry.name);
        else if (entries[entry.name] !== entry.size) mismatched.push(entry.name);
    });

    if (missing.length) throw new Error('Not in the archive: ' + missing.join(', '));
    if (mismatched.length) throw new Error('Wrong size in the archive: ' + mismatched.join(', '));

    var info = entries['info.json'];
    if (!info) throw new Error('The archive has no info.json');

    return { files: files.length, info: info };
}

function main() {
    var staging = fs.mkdtempSync(path.join(os.tmpdir(), 'rightactions-'));

    try {
        ENTRIES.forEach(function (entry) {
            var source = path.join(ROOT, entry);
            if (!fs.existsSync(source)) throw new Error('Missing entry: ' + entry);
            copyInto(source, path.join(staging, entry));
        });

        if (fs.existsSync(OUTPUT)) fs.unlinkSync(OUTPUT);

        try {
            execFileSync('zip', ['-qr', OUTPUT].concat(ENTRIES), { cwd: staging });
        } catch (noZip) {
            // No zip on this machine: PowerShell makes the same archive.
            var list = ENTRIES.map(function (entry) { return '.\\' + entry; }).join(',');
            execFileSync('powershell.exe', ['-NoProfile', '-Command',
                'Compress-Archive -Path ' + list + ' -DestinationPath "' + OUTPUT + '" -Force'
            ], { cwd: staging });
        }

        var checked = verifyArchive(OUTPUT, staging);

        console.log('Packaged ' + path.basename(OUTPUT) + ' (' + checked.files + ' files)');
        console.log('info.json: ' + checked.info + ' bytes');
    } finally {
        fs.rmSync(staging, { recursive: true, force: true });
    }
}

module.exports = { archiveEntries: archiveEntries, verifyArchive: verifyArchive };

if (require.main === module) main();
