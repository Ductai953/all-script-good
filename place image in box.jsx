#target illustrator
// place_fill_all_frames.jsx
// - Chọn các khung (rectangle / group có bounds) trước rồi chạy script.
// - Nếu ảnh ít hơn khung thì sẽ lặp lại ảnh để fill hết.
// - Scale = cover, tự xoay nếu cần.

function main() {
    if (app.documents.length === 0) {
        alert("Mở file Illustrator trước.");
        return;
    }
    var doc = app.activeDocument;
    var sel = doc.selection;

    if (!sel || sel.length === 0) {
        alert("Hãy chọn các khung (ít nhất 1) trước khi chạy script.");
        return;
    }

    // --- Collect frames from selection (use geometricBounds of each selected item) ---
    var frames = [];
    for (var s = 0; s < sel.length; s++) {
        try {
            var it = sel[s];
            if (!it) continue;
            // get geometricBounds [left, top, right, bottom]
            var gb = it.geometricBounds;
            if (!gb || gb.length !== 4) continue;
            var left = gb[0], top = gb[1], right = gb[2], bottom = gb[3];
            var w = Math.abs(right - left);
            var h = Math.abs(top - bottom);
            if (w <= 0 || h <= 0) continue;
            frames.push({
                item: it,
                left: left,
                top: top,
                right: right,
                bottom: bottom,
                w: w,
                h: h
            });
        } catch (e) {
            // ignore bad items
        }
    }

    if (frames.length === 0) {
        alert("Không tìm thấy khung hợp lệ trong selection.");
        return;
    }

    // --- Sort frames top->bottom, left->right ---
    (function sortFrames(arr) {
        // detect Y axis direction (Illustrator coordinates may have top>bottom)
        var first = arr[0];
        var yAxisPositiveUp = first.top > first.bottom;
        var EPS = 1.0;
        arr.sort(function(a, b) {
            var aCY = (a.top + a.bottom) / 2;
            var bCY = (b.top + b.bottom) / 2;
            var aCX = (a.left + a.right) / 2;
            var bCX = (b.left + b.right) / 2;
            var dy = aCY - bCY;
            if (Math.abs(dy) < EPS) {
                return aCX - bCX; // same row: left -> right
            }
            return yAxisPositiveUp ? (bCY - aCY) : (aCY - bCY);
        });
    })(frames);

    // --- Choose folder & collect image files ---
    var folder = Folder.selectDialog("Chọn thư mục chứa ảnh (jpg/png/psd/tif)");
    if (!folder) return;

    var files = folder.getFiles(/\.(jpg|jpeg|png|tif|tiff|psd)$/i);
    if (!files || files.length === 0) {
        alert("Không tìm thấy ảnh trong thư mục.");
        return;
    }

    // sort files by name (so order predictable)
    files.sort(function(a, b) {
        var na = a.name.toLowerCase();
        var nb = b.name.toLowerCase();
        if (na < nb) return -1;
        if (na > nb) return 1;
        return 0;
    });

    // --- Settings ---
    var SCALE_MODE = "cover"; // "cover" (fill & crop) - mặc định
    var ROTATE_TO_MATCH = true; // nếu hướng ảnh khác hướng khung -> xoay 90°

    // --- Loop frames and place images (repeat images if cần) ---
    for (var i = 0; i < frames.length; i++) {
        var frame = frames[i];
        var imgFile = files[i % files.length]; // repeat if ít ảnh hơn khung

        try {
            // place image
            var placed = doc.placedItems.add();
            placed.file = imgFile;

            // allow Illustrator some time? (ExtendScript single-threaded, but OK)
            // compute box dims
            var boxW = frame.w;
            var boxH = frame.h;

            // read placed image natural dims
            var imgW = placed.width;
            var imgH = placed.height;
            // safety: if zero dims, try embed (rare)
            if (imgW === 0 || imgH === 0) {
                try { placed.embed(); imgW = placed.width; imgH = placed.height; } catch(e) {}
                if (imgW === 0 || imgH === 0) {
                    // failed, remove and skip
                    try { placed.remove(); } catch(e){}
                    continue;
                }
            }

            // rotate if orientation mismatch
            var imgIsLandscape = (imgW >= imgH);
            var boxIsLandscape = (boxW >= boxH);
            if (ROTATE_TO_MATCH && (imgIsLandscape !== boxIsLandscape)) {
                try { placed.rotate(90); } catch(e) {}
                imgW = placed.width; imgH = placed.height;
            }

            // scale to cover (fill)
            var scaleFactor;
            if (SCALE_MODE === "cover") {
                scaleFactor = Math.max(boxW / imgW, boxH / imgH);
            } else {
                scaleFactor = Math.min(boxW / imgW, boxH / imgH);
            }
            placed.width = imgW * scaleFactor;
            placed.height = imgH * scaleFactor;

            // center placed into frame
            var pb = placed.geometricBounds; // [left, top, right, bottom]
            var pCenterX = (pb[0] + pb[2]) / 2;
            var pCenterY = (pb[1] + pb[3]) / 2;
            var targetCenterX = (frame.left + frame.right) / 2;
            var targetCenterY = (frame.top + frame.bottom) / 2;
            placed.translate(targetCenterX - pCenterX, targetCenterY - pCenterY);

            // create group and clipping mask (use exact bounding rect as mask so original frame stays visible)
            var g = doc.groupItems.add();
            // create rectangle mask at same position/size as frame
            var mask = g.pathItems.rectangle(frame.top, frame.left, boxW, boxH);
            mask.filled = true;
            mask.stroked = false;
            mask.clipping = true;

            // move placed into group (after mask)
            placed.move(g, ElementPlacement.PLACEATEND);

            // set group to be clipped
            g.clipped = true;

            // leave original frame untouched (so its stroke/appearance remains visible)
        } catch (err) {
            // if fail, try to clean up placed item
            try { if (placed) placed.remove(); } catch(e){}
            // continue to next
            continue;
        }
    }

    alert("Hoàn tất: đã fill " + frames.length + " khung (ảnh lặp nếu cần).");
}

main();