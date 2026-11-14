
/* =========================================================
   FACEGEOM AI — WORKING CAMERA + PHOTO ANALYSIS
   Uses MediaPipe FaceMesh loaded by index.html.
   Measurements are experimental 2D estimates.
   ========================================================= */

"use strict";

const video = document.getElementById("video");
const canvas = document.getElementById("output");
const ctx = canvas.getContext("2d");

const placeholder = document.getElementById("placeholder");
const statusText = document.getElementById("status");
const startButton = document.getElementById("startCamera");
const stopButton = document.getElementById("stopCamera");
const imageInput = document.getElementById("imageInput");

let faceMesh = null;
let cameraStream = null;
let cameraRunning = false;
let processing = false;
let currentMode = "idle";
let photoObjectUrl = null;

const $ = (id) => document.getElementById(id);

function setStatus(message) {
    if (statusText) statusText.textContent = message;
}

function setMetric(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
}

function resetMetrics() {
    [
        "faceWidth", "faceHeight", "eyeDistance", "faceRatio",
        "jawAngle", "landmarks", "symmetryScore", "harmonyScore",
        "thirdsValue", "eyeSpacingValue", "jawProportionValue",
        "midlineValue"
    ].forEach(id => setMetric(id, "--"));

    setMetric("symmetryDescription", "Waiting for facial analysis.");
    setMetric("harmonyDescription", "Waiting for facial analysis.");
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleAt(a, vertex, b) {
    const v1 = { x: a.x - vertex.x, y: a.y - vertex.y };
    const v2 = { x: b.x - vertex.x, y: b.y - vertex.y };

    const denominator =
        Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);

    if (!denominator) return 0;

    const cosine = Math.max(-1, Math.min(1,
        (v1.x * v2.x + v1.y * v2.y) / denominator
    ));

    return Math.acos(cosine) * 180 / Math.PI;
}

function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function getPoint(points, index) {
    return points[index];
}

function calculateAnalysis(points) {
    const leftFace = getPoint(points, 234);
    const rightFace = getPoint(points, 454);
    const forehead = getPoint(points, 10);
    const chin = getPoint(points, 152);

    const leftEyeOuter = getPoint(points, 33);
    const rightEyeOuter = getPoint(points, 263);

    const leftEyeInner = getPoint(points, 133);
    const rightEyeInner = getPoint(points, 362);

    const leftCheek = getPoint(points, 234);
    const rightCheek = getPoint(points, 454);

    const leftJaw = getPoint(points, 172);
    const rightJaw = getPoint(points, 397);

    const noseTip = getPoint(points, 1);
    const brow = getPoint(points, 9);
    const noseBase = getPoint(points, 2);

    const eyeDistance = distance(leftEyeOuter, rightEyeOuter);

    if (eyeDistance < 0.001) return;

    const faceWidth = distance(leftFace, rightFace) / eyeDistance;
    const faceHeight = distance(forehead, chin) / eyeDistance;
    const faceRatio = faceWidth / faceHeight;

    const jawWidth = distance(leftJaw, rightJaw);
    const cheekWidth = distance(leftCheek, rightCheek);

    const jawProportion = jawWidth / cheekWidth;
    const eyeSpacing = distance(leftEyeInner, rightEyeInner) / eyeDistance;

    const upperThird = Math.abs(brow.y - forehead.y);
    const middleThird = Math.abs(noseBase.y - brow.y);
    const lowerThird = Math.abs(chin.y - noseBase.y);

    const thirds = [upperThird, middleThird, lowerThird];
    const thirdsMean = average(thirds);

    const thirdsDeviation =
        average(thirds.map(v => Math.abs(v - thirdsMean))) / thirdsMean;

    const mirrorPairs = [
        [33, 263], [133, 362], [159, 386], [145, 374],
        [70, 300], [105, 334], [127, 356], [234, 454],
        [172, 397], [136, 365], [150, 379], [176, 400]
    ];

    const midlineX = noseTip.x;

    const pairErrors = mirrorPairs.map(([a, b]) => {
        const pa = points[a];
        const pb = points[b];

        const xError = Math.abs(
            (midlineX - pa.x) - (pb.x - midlineX)
        );

        const yError = Math.abs(pa.y - pb.y);

        return Math.hypot(xError, yError);
    });

    const meanSymmetryError = average(pairErrors);

    const symmetryScore =
        clamp(100 - meanSymmetryError * 350, 0, 100);

    const thirdsPenalty =
        clamp(thirdsDeviation * 180, 0, 45);

    const eyePenalty =
        clamp(Math.abs(eyeSpacing - 1) * 35, 0, 25);

    const jawPenalty =
        clamp(Math.abs(jawProportion - 0.85) * 35, 0, 25);

    const harmonyScore =
        clamp(100 - thirdsPenalty - eyePenalty - jawPenalty, 0, 100);

    const jawAngle = angleAt(leftJaw, chin, rightJaw);

    const frontalness =
        Math.abs(leftEyeOuter.y - rightEyeOuter.y) / eyeDistance;

    setMetric("faceWidth", faceWidth.toFixed(3));
    setMetric("faceHeight", faceHeight.toFixed(3));
    setMetric("eyeDistance", "1.000");
    setMetric("faceRatio", faceRatio.toFixed(3));
    setMetric("jawAngle", jawAngle.toFixed(1) + "°");
    setMetric("landmarks", String(points.length));

    if (frontalness > 0.18) {
        setMetric("symmetryScore", "--");
        setMetric("harmonyScore", "--");

        setMetric(
            "symmetryDescription",
            "Turn your face more directly toward the camera."
        );

        setMetric(
            "harmonyDescription",
            "Analysis paused because the face is tilted or turned."
        );
    } else {
        setMetric("symmetryScore", symmetryScore.toFixed(0));
        setMetric("harmonyScore", harmonyScore.toFixed(0));

        setMetric(
            "symmetryDescription",
            "Estimated from mirrored landmark pairs; sensitive to pose."
        );

        setMetric(
            "harmonyDescription",
            "Experimental proportion estimate, not an attractiveness rating."
        );
    }

    const thirdRatio = thirds
        .map(v => (v / thirdsMean).toFixed(2))
        .join(" : ");

    setMetric("thirdsValue", thirdRatio);
    setMetric("eyeSpacingValue", eyeSpacing.toFixed(3));
    setMetric("jawProportionValue", jawProportion.toFixed(3));

    setMetric(
        "midlineValue",
        (meanSymmetryError / eyeDistance).toFixed(3)
    );
}

function resizeCanvas(width, height) {
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
}

function drawResults(results) {
    const source = currentMode === "photo"
        ? results.image
        : video;

    if (!source) return;

    const width =
        source.videoWidth || source.naturalWidth || source.width;

    const height =
        source.videoHeight || source.naturalHeight || source.height;

    if (!width || !height) return;

    resizeCanvas(width, height);
    ctx.clearRect(0, 0, width, height);

    if (currentMode === "camera") {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(source, 0, 0, width, height);
        ctx.restore();
    } else {
        ctx.drawImage(source, 0, 0, width, height);
    }

    if (
        results.multiFaceLandmarks &&
        results.multiFaceLandmarks.length
    ) {
        const points = results.multiFaceLandmarks[0];

        calculateAnalysis(points);

        if (
            typeof drawConnectors === "function" &&
            typeof FACEMESH_TESSELATION !== "undefined"
        ) {
            ctx.save();

            if (currentMode === "camera") {
                ctx.translate(width, 0);
                ctx.scale(-1, 1);
            }

            drawConnectors(
                ctx,
                points,
                FACEMESH_TESSELATION,
                {
                    color: "rgba(72,198,239,0.35)",
                    lineWidth: 0.5
                }
            );

            if (typeof FACEMESH_CONTOURS !== "undefined") {
                drawConnectors(
                    ctx,
                    points,
                    FACEMESH_CONTOURS,
                    {
                        color: "#48c6ef",
                        lineWidth: 1
                    }
                );
            }

            ctx.restore();
        }

        if (placeholder) placeholder.style.display = "none";

        setStatus("FACE DETECTED");

    } else {
        resetMetrics();
        setStatus("NO FACE DETECTED");

        if (placeholder) placeholder.style.display = "flex";
    }
}

async function initializeFaceMesh() {
    if (faceMesh) return faceMesh;

    if (typeof FaceMesh === "undefined") {
        throw new Error(
            "MediaPipe did not load. Check your internet connection and reload."
        );
    }

    faceMesh = new FaceMesh({
        locateFile: file =>
            "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/" + file
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(results => {
        drawResults(results);
        processing = false;
    });

    return faceMesh;
}

async function startCamera() {
    try {
        if (cameraRunning) return;

        setStatus("STARTING CAMERA...");

        await initializeFaceMesh();

        if (
            !navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia
        ) {
            throw new Error(
                "Camera access requires localhost or HTTPS. Open the project using VS Code Live Server."
            );
        }

        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false
        });

        video.srcObject = cameraStream;

        await video.play();

        currentMode = "camera";
        cameraRunning = true;
        processing = false;

        if (placeholder) placeholder.style.display = "none";

        setStatus("CAMERA ACTIVE");

        async function cameraLoop() {
            if (!cameraRunning) return;

            if (!processing && video.readyState >= 2) {
                processing = true;

                try {
                    await faceMesh.send({ image: video });

                } catch (error) {
                    processing = false;

                    console.error(
                        "FaceMesh camera processing error:",
                        error
                    );

                    setStatus("ANALYSIS ERROR");
                }
            }

            requestAnimationFrame(cameraLoop);
        }

        requestAnimationFrame(cameraLoop);

    } catch (error) {
        console.error(error);

        setStatus("CAMERA ERROR");

        alert(error.message || "Could not start the camera.");

        stopCamera();
    }
}

function stopCamera() {
    cameraRunning = false;
    processing = false;

    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    if (video) {
        video.pause();
        video.srcObject = null;
    }

    if (currentMode === "camera") {
        currentMode = "idle";

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        resizeCanvas(1, 1);
        resetMetrics();

        if (placeholder) placeholder.style.display = "flex";

        setStatus("SYSTEM READY");
    }
}

async function analyzePhoto(file) {
    if (!file || !file.type.startsWith("image/")) {
        alert("Please choose a valid image file.");
        return;
    }

    try {
        stopCamera();

        await initializeFaceMesh();

        if (photoObjectUrl) {
            URL.revokeObjectURL(photoObjectUrl);
        }

        photoObjectUrl = URL.createObjectURL(file);

        const image = new Image();

        image.onload = async () => {
            currentMode = "photo";
            processing = true;

            if (placeholder) placeholder.style.display = "none";

            setStatus("ANALYZING PHOTO...");

            try {
                await faceMesh.send({ image });

            } catch (error) {
                processing = false;

                console.error("Photo analysis error:", error);

                setStatus("PHOTO ANALYSIS ERROR");

                alert(
                    "Could not analyze this photo. Try another image."
                );
            }
        };

        image.onerror = () => {
            setStatus("IMAGE ERROR");

            alert("The selected image could not be opened.");
        };

        image.src = photoObjectUrl;

    } catch (error) {
        console.error(error);

        setStatus("SYSTEM ERROR");

        alert(
            error.message || "Could not initialize facial analysis."
        );
    }
}

// Connect the visible controls.
if (startButton) {
    startButton.addEventListener("click", startCamera);
}

if (stopButton) {
    stopButton.addEventListener("click", stopCamera);
}

if (imageInput) {
    imageInput.addEventListener("change", event => {
        const file = event.target.files && event.target.files[0];

        if (file) analyzePhoto(file);

        event.target.value = "";
    });
}

window.addEventListener("beforeunload", () => {
    stopCamera();

    if (photoObjectUrl) {
        URL.revokeObjectURL(photoObjectUrl);
    }
});

resetMetrics();
setStatus("SYSTEM READY");
