
/* =========================================================
   FACEGEOM AI
   FACIAL LANDMARK DETECTION + FINAL ANALYSIS REPORT
   MediaPipe Face Mesh | 2D Geometric Analysis
   ========================================================= */

"use strict";

// ELEMENTS
const video = document.getElementById("video");
const canvas = document.getElementById("output");
const ctx = canvas.getContext("2d");

const placeholder = document.getElementById("placeholder");
const statusText = document.getElementById("status");
const startButton = document.getElementById("startCamera");
const stopButton = document.getElementById("stopCamera");
const imageInput = document.getElementById("imageInput");
const scanButton = document.getElementById("scanFace");
const rescanButton = document.getElementById("rescanFace");

const $ = id => document.getElementById(id);

// SYSTEM STATE
let faceMesh = null;
let cameraStream = null;
let cameraRunning = false;
let processing = false;
let currentMode = "idle";
let photoObjectUrl = null;

let scanActive = false;
let scanFrames = [];
let scanStartTime = 0;
let scanAnimation = null;

// ---------------------------------------------------------
// BASIC HELPERS
// ---------------------------------------------------------

function setStatus(message) {
    if (statusText) statusText.textContent = message;
}

function setMetric(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
}

function average(values) {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleAt(a, vertex, b) {
    const v1 = {
        x: a.x - vertex.x,
        y: a.y - vertex.y
    };

    const v2 = {
        x: b.x - vertex.x,
        y: b.y - vertex.y
    };

    const denominator =
        Math.hypot(v1.x, v1.y) *
        Math.hypot(v2.x, v2.y);

    if (!denominator) return 0;

    const cosine = clamp(
        (v1.x * v2.x + v1.y * v2.y) / denominator,
        -1,
        1
    );

    return Math.acos(cosine) * 180 / Math.PI;
}

// ---------------------------------------------------------
// RESET LIVE METRICS
// ---------------------------------------------------------

function resetMetrics() {
    [
        "faceWidth",
        "faceHeight",
        "eyeDistance",
        "faceRatio",
        "jawAngle",
        "landmarks",
        "symmetryScore",
        "harmonyScore",
        "thirdsValue",
        "eyeSpacingValue",
        "jawProportionValue",
        "midlineValue"
    ].forEach(id => setMetric(id, "--"));

    setMetric(
        "symmetryDescription",
        "Waiting for facial analysis."
    );

    setMetric(
        "harmonyDescription",
        "Waiting for facial analysis."
    );
}

// ---------------------------------------------------------
// FACIAL GEOMETRY CALCULATIONS
// ---------------------------------------------------------

function calculateAnalysis(points) {

    if (!points || points.length < 455) return null;

    const leftFace = points[234];
    const rightFace = points[454];

    const forehead = points[10];
    const chin = points[152];

    const leftEyeOuter = points[33];
    const rightEyeOuter = points[263];

    const leftEyeInner = points[133];
    const rightEyeInner = points[362];

    const leftJaw = points[172];
    const rightJaw = points[397];

    const noseTip = points[1];
    const brow = points[9];
    const noseBase = points[2];

    // Eye distance is used as a normalization reference.
    const eyeDistance = distance(
        leftEyeOuter,
        rightEyeOuter
    );

    if (eyeDistance < 0.001) return null;

    // NORMALIZED MEASUREMENTS
    const faceWidth =
        distance(leftFace, rightFace) / eyeDistance;

    const faceHeight =
        distance(forehead, chin) / eyeDistance;

    const faceRatio = faceWidth / faceHeight;

    const jawWidth = distance(leftJaw, rightJaw);
    const cheekWidth = distance(leftFace, rightFace);

    const jawProportion =
        cheekWidth > 0 ? jawWidth / cheekWidth : 0;

    const eyeSpacing =
        distance(leftEyeInner, rightEyeInner) / eyeDistance;

    // FACIAL THIRDS
    const upperThird = Math.abs(brow.y - forehead.y);
    const middleThird = Math.abs(noseBase.y - brow.y);
    const lowerThird = Math.abs(chin.y - noseBase.y);

    const thirds = [
        upperThird,
        middleThird,
        lowerThird
    ];

    const thirdsMean = average(thirds);

    const thirdsDeviation = thirdsMean > 0
        ? average(
            thirds.map(value =>
                Math.abs(value - thirdsMean)
            )
        ) / thirdsMean
        : 0;

    // MIRRORED LANDMARK PAIRS
    const mirrorPairs = [
        [33, 263],
        [133, 362],
        [159, 386],
        [145, 374],
        [70, 300],
        [105, 334],
        [127, 356],
        [234, 454],
        [172, 397],
        [136, 365],
        [150, 379],
        [176, 400]
    ];

    const midlineX = noseTip.x;

    const pairErrors = mirrorPairs.map(([a, b]) => {
        const pointA = points[a];
        const pointB = points[b];

        const xError = Math.abs(
            (midlineX - pointA.x) -
            (pointB.x - midlineX)
        );

        const yError = Math.abs(
            pointA.y - pointB.y
        );

        return Math.hypot(xError, yError);
    });

    const meanSymmetryError = average(pairErrors);

    // EXPERIMENTAL SYMMETRY ESTIMATE
    const symmetryScore = clamp(
        100 - meanSymmetryError * 350,
        0,
        100
    );

    // EXPERIMENTAL PROPORTION ESTIMATE
    const thirdsPenalty = clamp(
        thirdsDeviation * 180,
        0,
        45
    );

    const eyePenalty = clamp(
        Math.abs(eyeSpacing - 1) * 35,
        0,
        25
    );

    const jawPenalty = clamp(
        Math.abs(jawProportion - 0.85) * 35,
        0,
        25
    );

    const harmonyScore = clamp(
        100 - thirdsPenalty - eyePenalty - jawPenalty,
        0,
        100
    );

    const jawAngle = angleAt(
        leftJaw,
        chin,
        rightJaw
    );

    // ESTIMATE OF FACE ALIGNMENT
    const frontalness =
        Math.abs(leftEyeOuter.y - rightEyeOuter.y) /
        eyeDistance;

    const thirdRatio = thirds
        .map(value =>
            (value / Math.max(thirdsMean, 0.0001)).toFixed(2)
        )
        .join(" : ");

    // UPDATE LIVE DISPLAY
    setMetric("faceWidth", faceWidth.toFixed(3));
    setMetric("faceHeight", faceHeight.toFixed(3));
    setMetric("eyeDistance", "1.000");
    setMetric("faceRatio", faceRatio.toFixed(3));
    setMetric("jawAngle", jawAngle.toFixed(1) + "°");
    setMetric("landmarks", String(points.length));

    setMetric("thirdsValue", thirdRatio);
    setMetric("eyeSpacingValue", eyeSpacing.toFixed(3));
    setMetric("jawProportionValue", jawProportion.toFixed(3));

    setMetric(
        "midlineValue",
        (meanSymmetryError / eyeDistance).toFixed(3)
    );

    if (frontalness > 0.18) {
        setMetric("symmetryScore", "--");
        setMetric("harmonyScore", "--");

        setMetric(
            "symmetryDescription",
            "Face alignment is outside the preferred range."
        );

        setMetric(
            "harmonyDescription",
            "Turn your face directly toward the camera."
        );
    } else {
        setMetric(
            "symmetryScore",
            symmetryScore.toFixed(0)
        );

        setMetric(
            "harmonyScore",
            harmonyScore.toFixed(0)
        );

        setMetric(
            "symmetryDescription",
            "Estimated from mirrored landmark pairs."
        );

        setMetric(
            "harmonyDescription",
            "Experimental geometric proportion estimate."
        );
    }

    // RETURN THE ACTUAL CALCULATED DATA
    return {
        faceWidth,
        faceHeight,
        faceRatio,
        eyeDistance,
        jawWidth,
        jawProportion,
        eyeSpacing,
        thirdsDeviation,
        thirdRatio,
        symmetryScore,
        harmonyScore,
        meanSymmetryError,
        jawAngle,
        frontalness
    };
}

// ---------------------------------------------------------
// CANVAS DISPLAY
// ---------------------------------------------------------

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
        source.videoWidth ||
        source.naturalWidth ||
        source.width;

    const height =
        source.videoHeight ||
        source.naturalHeight ||
        source.height;

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

        const analysis = calculateAnalysis(points);

        // COLLECT STABLE FRAMES DURING THE SCAN
        if (
            scanActive &&
            currentMode === "camera" &&
            analysis &&
            analysis.frontalness <= 0.18
        ) {
            scanFrames.push({
                points: points.map(point => ({
                    x: point.x,
                    y: point.y,
                    z: point.z || 0
                }))
            });
        }

        // DRAW FACIAL MESH
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

        if (placeholder) {
            placeholder.style.display = "none";
        }

        setStatus(
            scanActive ? "SCAN IN PROGRESS" : "FACE DETECTED"
        );

    } else {
        resetMetrics();
        setStatus(
            scanActive ? "SEARCHING FOR FACE..." : "NO FACE DETECTED"
        );

        if (placeholder) {
            placeholder.style.display = "flex";
        }
    }
}

// ---------------------------------------------------------
// MEDIAPIPE INITIALIZATION
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// CAMERA START
// ---------------------------------------------------------

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
                "Camera access requires HTTPS or localhost."
            );
        }

        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user"
            },
            audio: false
        });

        video.srcObject = cameraStream;

        await video.play();

        currentMode = "camera";
        cameraRunning = true;
        processing = false;

        scanButton.disabled = false;

        if (placeholder) {
            placeholder.style.display = "none";
        }

        setStatus("CAMERA ACTIVE");

        setScanFeedback(
            "Camera ready. Position your face in the frame.",
            0
        );

        async function cameraLoop() {

            if (!cameraRunning) return;

            if (!processing && video.readyState >= 2) {
                processing = true;

                try {
                    await faceMesh.send({
                        image: video
                    });
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

        alert(
            error.message || "Could not start the camera."
        );

        stopCamera();
    }
}

// ---------------------------------------------------------
// CAMERA STOP
// ---------------------------------------------------------

function stopCamera() {

    cancelScan();

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

    scanButton.disabled = true;

    if (currentMode === "camera") {
        currentMode = "idle";

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        resizeCanvas(1, 1);
        resetMetrics();

        if (placeholder) {
            placeholder.style.display = "flex";
        }

        setStatus("SYSTEM READY");

        setScanFeedback(
            "Start the camera to begin.",
            0
        );
    }
}

// ---------------------------------------------------------
// PHOTO ANALYSIS
// ---------------------------------------------------------

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

            if (placeholder) {
                placeholder.style.display = "none";
            }

            setStatus("ANALYZING PHOTO...");

            try {
                await faceMesh.send({
                    image: image
                });

                processing = false;
                setStatus("PHOTO ANALYSIS COMPLETE");

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

// ---------------------------------------------------------
// FIVE-SECOND SCAN SYSTEM
// ---------------------------------------------------------

function setScanFeedback(message, percent) {

    const countdown = $("scanCountdown");
    const percentage = $("scanPercent");
    const progress = $("scanProgress");

    if (countdown) {
        countdown.textContent = message;
    }

    if (percentage) {
        percentage.textContent = Math.round(percent) + "%";
    }

    if (progress) {
        progress.style.width = percent + "%";
    }
}

function startFinalScan() {

    if (!cameraRunning || currentMode !== "camera") {
        alert("Please start the camera before scanning.");
        return;
    }

    cancelScan();

    scanFrames = [];
    scanActive = true;
    scanStartTime = Date.now();

    $("finalReport").classList.remove("visible");

    scanButton.disabled = true;
    scanButton.textContent = "SCANNING...";

    setStatus("SCAN IN PROGRESS");

    function updateScan() {

        if (!scanActive) return;

        const elapsed =
            (Date.now() - scanStartTime) / 1000;

        const remaining = Math.max(0, 5 - elapsed);

        const percent = Math.min(
            100,
            (elapsed / 5) * 100
        );

        setScanFeedback(
            "Scanning face... " + remaining.toFixed(1) + " seconds remaining",
            percent
        );

        if (elapsed >= 5) {
            finishFinalScan();
        } else {
            scanAnimation = requestAnimationFrame(updateScan);
        }
    }

    updateScan();
}

function cancelScan() {

    scanActive = false;

    if (scanAnimation !== null) {
        cancelAnimationFrame(scanAnimation);
        scanAnimation = null;
    }

    if (scanButton) {
        scanButton.disabled = !cameraRunning;
        scanButton.textContent = "START 5-SECOND SCAN";
    }
}

// ---------------------------------------------------------
// AVERAGE LANDMARK POSITIONS
// ---------------------------------------------------------

function averageLandmarks(frames) {

    if (!frames.length) return null;

    const landmarkCount = frames[0].points.length;
    const averagedPoints = [];

    for (let i = 0; i < landmarkCount; i++) {

        averagedPoints.push({
            x: average(
                frames.map(frame => frame.points[i].x)
            ),

            y: average(
                frames.map(frame => frame.points[i].y)
            ),

            z: average(
                frames.map(frame => frame.points[i].z)
            )
        });
    }

    return averagedPoints;
}

// ---------------------------------------------------------
// COMPLETE THE SCAN
// ---------------------------------------------------------

function finishFinalScan() {

    scanActive = false;

    if (scanAnimation !== null) {
        cancelAnimationFrame(scanAnimation);
        scanAnimation = null;
    }

    scanButton.disabled = false;
    scanButton.textContent = "START 5-SECOND SCAN";

    const validFrames = scanFrames.length;

    if (validFrames < 10) {

        setStatus("SCAN INCOMPLETE");

        setScanFeedback(
            "Not enough stable face frames. Face the camera directly and try again.",
            100
        );

        $("reportStatus").textContent =
            "The scan did not collect enough stable facial data.";

        $("finalReport").classList.add("visible");

        $("finalReport").scrollIntoView({
            behavior: "smooth"
        });

        return;
    }

    const averagedPoints = averageLandmarks(scanFrames);

    const result = calculateAnalysis(averagedPoints);

    if (!result || result.frontalness > 0.18) {

        setStatus("SCAN INCOMPLETE");

        setScanFeedback(
            "Face alignment was not stable. Please scan again.",
            100
        );

        $("reportStatus").textContent =
            "Unable to produce a reliable report. Keep your face straight and try again.";

        $("finalReport").classList.add("visible");

        $("finalReport").scrollIntoView({
            behavior: "smooth"
        });

        return;
    }

    showFinalReport(result, validFrames);

    setStatus("ANALYSIS COMPLETE");

    setScanFeedback(
        "Scan complete. " + validFrames + " stable frames analysed.",
        100
    );

    $("reportStatus").textContent =
        "Analysis completed using " + validFrames +
        " detected facial frames.";

    $("finalReport").classList.add("visible");

    $("finalReport").scrollIntoView({
        behavior: "smooth"
    });
}

// ---------------------------------------------------------
// FACE SHAPE ESTIMATION
// ---------------------------------------------------------

function estimateFaceShape(result) {

    const ratio = result.faceRatio;
    const jaw = result.jawProportion;

    if (ratio >= 0.88) {
        return "Round / Broad";
    }

    if (ratio <= 0.68) {
        return "Oblong / Long";
    }

    if (jaw >= 0.88) {
        return "Square-like";
    }

    if (jaw <= 0.70) {
        return "Heart / Tapered";
    }

    return "Oval-like";
}

// ---------------------------------------------------------
// GENERATE FINAL REPORT
// ---------------------------------------------------------

function showFinalReport(result, frameCount) {

    const shape = estimateFaceShape(result);

    setMetric(
        "finalSymmetry",
        result.symmetryScore.toFixed(0) + " / 100"
    );

    setMetric(
        "finalHarmony",
        result.harmonyScore.toFixed(0) + " / 100"
    );

    setMetric(
        "finalFaceShape",
        shape
    );

    setMetric(
        "finalRatio",
        result.faceRatio.toFixed(3)
    );

    setMetric(
        "finalWidth",
        result.faceWidth.toFixed(3)
    );

    setMetric(
        "finalHeight",
        result.faceHeight.toFixed(3)
    );

    setMetric(
        "finalEyeSpacing",
        result.eyeSpacing.toFixed(3)
    );

    setMetric(
        "finalJaw",
        result.jawProportion.toFixed(3)
    );

    // OBSERVATIONS
    let observation = "";

    if (result.thirdsDeviation < 0.12) {
        observation +=
            "The measured upper, middle and lower facial thirds are relatively similar in length. ";
    } else {
        observation +=
            "The measured facial thirds show variation in their relative lengths. ";
    }

    if (result.symmetryScore >= 85) {
        observation +=
            "The detected left-right landmark pairs show relatively low positional differences. ";
    } else {
        observation +=
            "The detected left-right landmark pairs show measurable positional differences. ";
    }

    observation +=
        "These observations describe the detected 2D geometry, not facial quality.";

    setMetric(
        "finalObservation",
        observation
    );

    // STYLE SUGGESTIONS
    let suggestions = "";

    switch (shape) {

        case "Round / Broad":
            suggestions =
                "You could explore hairstyles with some height on top and less width at the sides.";
            break;

        case "Oblong / Long":
            suggestions =
                "You could explore hairstyles with moderate side volume and less height on top.";
            break;

        case "Square-like":
            suggestions =
                "You could explore textured hairstyles or softer outlines.";
            break;

        case "Heart / Tapered":
            suggestions =
                "You could explore styles that add moderate visual balance around the sides.";
            break;

        default:
            suggestions =
                "An oval-like estimate offers flexibility to explore different hairstyles and grooming styles.";
    }

    setMetric(
        "finalSuggestions",
        suggestions
    );
}

// ---------------------------------------------------------
// EVENT LISTENERS
// ---------------------------------------------------------

if (startButton) {
    startButton.addEventListener("click", startCamera);
}

if (stopButton) {
    stopButton.addEventListener("click", stopCamera);
}

if (scanButton) {
    scanButton.addEventListener("click", startFinalScan);
}

if (rescanButton) {
    rescanButton.addEventListener("click", () => {

        $("finalReport").classList.remove("visible");

        if (!cameraRunning) {
            startCamera();
            return;
        }

        startFinalScan();
    });
}

if (imageInput) {
    imageInput.addEventListener("change", event => {

        const file =
            event.target.files &&
            event.target.files[0];

        if (file) {
            analyzePhoto(file);
        }

        event.target.value = "";
    });
}

window.addEventListener("beforeunload", () => {

    stopCamera();

    if (photoObjectUrl) {
        URL.revokeObjectURL(photoObjectUrl);
    }
});

// ---------------------------------------------------------
// INITIAL STATE
// ---------------------------------------------------------

resetMetrics();

setStatus("SYSTEM READY");

setScanFeedback(
    "Start the camera to begin.",
    0
);

