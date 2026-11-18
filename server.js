// server.ts
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var PORT = Number(process.env.PORT || 3e3);
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
async function startServer() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.get("/api/health", (_req, res) => {
    const hasKey = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"
    );
    res.json({ ok: true, hasGeminiKey: hasKey });
  });
  app.post("/api/analyze-pose", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(400).json({
        error: "GEMINI_API_KEY is not configured. Configure your key in Settings > Secrets, or switch to Local Offline Vision mode."
      });
      return;
    }
    const { imageBase64, mimeType, targetSubjectId, imageWidth, imageHeight } = req.body;
    if (!imageBase64 || !mimeType) {
      res.status(400).json({ error: "Missing imageBase64 or mimeType in request body." });
      return;
    }
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, "");
    const landmarkSchema = {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.NUMBER, description: "Normalized X coordinate 0..1 from image left to right" },
        y: { type: Type.NUMBER, description: "Normalized Y coordinate 0..1 from image top to bottom" },
        confidence: { type: Type.NUMBER, description: "Confidence 0..1" },
        occluded: { type: Type.BOOLEAN }
      },
      required: ["x", "y", "confidence", "occluded"]
    };
    const handSchema = {
      type: Type.OBJECT,
      properties: {
        visible: { type: Type.BOOLEAN },
        confidence: { type: Type.NUMBER },
        wristAngleDeg: { type: Type.NUMBER },
        palmOrientation: {
          type: Type.STRING,
          description: "One of: forward, backward, inward, outward, up, down"
        },
        gestureLabel: { type: Type.STRING },
        contactTarget: {
          type: Type.STRING,
          description: "One of: none, face, chin, hip, chest, other-hand"
        },
        thumbCurl: { type: Type.NUMBER },
        indexCurl: { type: Type.NUMBER },
        middleCurl: { type: Type.NUMBER },
        ringCurl: { type: Type.NUMBER },
        pinkyCurl: { type: Type.NUMBER },
        fingerSpread: { type: Type.NUMBER }
      },
      required: [
        "visible",
        "confidence",
        "wristAngleDeg",
        "palmOrientation",
        "gestureLabel",
        "contactTarget",
        "thumbCurl",
        "indexCurl",
        "middleCurl",
        "ringCurl",
        "pinkyCurl",
        "fingerSpread"
      ]
    };
    const promptText = `Analyze this reference image for 3D character pose retargeting into MikuMikuDance (MMD).
CRITICAL RULES:
1. Detect ALL human or anime character subjects in the image with normalized bounding boxes [xmin, ymin, xmax, ymax] in 0..1 coordinates.
2. Focus full landmark, hand, and expression extraction ONLY on subject #${targetSubjectId ?? 1}. Do not mix body parts from multiple people.
3. Distinguish the character's ANATOMICAL LEFT vs ANATOMICAL RIGHT carefully! When a character faces the camera ("front"), their anatomical left arm/leg is on the viewer's right (higher X value).
4. Provide normalized 2D coordinates (0..1) for nose, neck, leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist, leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle.
5. Provide accurate 3D orientation & depth hints (torsoYawDeg, torsoPitchDeg, torsoRollDeg, elbow/knee forward depth -1..1), hand finger curls (0=extended, 1=curled), and facial expression weights (leftEyeOpen, rightEyeOpen, mouthOpen, smileIntensity, browIntensity, gazeX, gazeY). If the face is obscured or small, set faceVisible=false or low faceConfidence and include a warning.`;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            { inlineData: { mimeType, data: cleanBase64 } },
            { text: promptText }
          ]
        },
        config: {
          systemInstruction: "You are a precision 3D computer vision pose estimation engine. Output exact normalized coordinates and anatomical parameters as strict JSON.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              subjects: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    label: { type: Type.STRING },
                    xmin: { type: Type.NUMBER },
                    ymin: { type: Type.NUMBER },
                    xmax: { type: Type.NUMBER },
                    ymax: { type: Type.NUMBER },
                    poseType: { type: Type.STRING },
                    facingDirection: { type: Type.STRING },
                    confidence: { type: Type.NUMBER }
                  },
                  required: ["id", "label", "xmin", "ymin", "xmax", "ymax", "poseType", "facingDirection", "confidence"]
                }
              },
              selectedSubjectId: { type: Type.INTEGER },
              landmarks: {
                type: Type.OBJECT,
                properties: {
                  nose: landmarkSchema,
                  neck: landmarkSchema,
                  leftShoulder: landmarkSchema,
                  rightShoulder: landmarkSchema,
                  leftElbow: landmarkSchema,
                  rightElbow: landmarkSchema,
                  leftWrist: landmarkSchema,
                  rightWrist: landmarkSchema,
                  leftHip: landmarkSchema,
                  rightHip: landmarkSchema,
                  leftKnee: landmarkSchema,
                  rightKnee: landmarkSchema,
                  leftAnkle: landmarkSchema,
                  rightAnkle: landmarkSchema
                },
                required: [
                  "nose",
                  "neck",
                  "leftShoulder",
                  "rightShoulder",
                  "leftElbow",
                  "rightElbow",
                  "leftWrist",
                  "rightWrist",
                  "leftHip",
                  "rightHip",
                  "leftKnee",
                  "rightKnee",
                  "leftAnkle",
                  "rightAnkle"
                ]
              },
              leftHand: handSchema,
              rightHand: handSchema,
              expression: {
                type: Type.OBJECT,
                properties: {
                  faceVisible: { type: Type.BOOLEAN },
                  faceConfidence: { type: Type.NUMBER },
                  warning: { type: Type.STRING },
                  dominantExpression: { type: Type.STRING },
                  headYawDeg: { type: Type.NUMBER },
                  headPitchDeg: { type: Type.NUMBER },
                  headRollDeg: { type: Type.NUMBER },
                  leftEyeOpen: { type: Type.NUMBER },
                  rightEyeOpen: { type: Type.NUMBER },
                  mouthOpen: { type: Type.NUMBER },
                  smileIntensity: { type: Type.NUMBER },
                  browIntensity: { type: Type.NUMBER },
                  gazeX: { type: Type.NUMBER },
                  gazeY: { type: Type.NUMBER }
                },
                required: [
                  "faceVisible",
                  "faceConfidence",
                  "dominantExpression",
                  "headYawDeg",
                  "headPitchDeg",
                  "headRollDeg",
                  "leftEyeOpen",
                  "rightEyeOpen",
                  "mouthOpen",
                  "smileIntensity",
                  "browIntensity",
                  "gazeX",
                  "gazeY"
                ]
              },
              depthHints: {
                type: Type.OBJECT,
                properties: {
                  torsoYawDeg: { type: Type.NUMBER },
                  torsoPitchDeg: { type: Type.NUMBER },
                  torsoRollDeg: { type: Type.NUMBER },
                  leftElbowForward: { type: Type.NUMBER },
                  rightElbowForward: { type: Type.NUMBER },
                  leftKneeForward: { type: Type.NUMBER },
                  rightKneeForward: { type: Type.NUMBER },
                  weightSide: { type: Type.STRING },
                  poseSummary: { type: Type.STRING }
                },
                required: [
                  "torsoYawDeg",
                  "torsoPitchDeg",
                  "torsoRollDeg",
                  "leftElbowForward",
                  "rightElbowForward",
                  "leftKneeForward",
                  "rightKneeForward",
                  "weightSide",
                  "poseSummary"
                ]
              },
              notes: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["subjects", "selectedSubjectId", "landmarks", "leftHand", "rightHand", "expression", "depthHints", "notes"]
          }
        }
      });
      const rawText = (response.text ?? "").trim();
      if (!rawText) {
        res.status(502).json({ error: "Gemini Vision returned an empty response." });
        return;
      }
      const data = JSON.parse(rawText);
      const formattedLandmarks = {};
      for (const [k, v] of Object.entries(data.landmarks || {})) {
        const lm = v;
        formattedLandmarks[k] = {
          name: k,
          x: lm.x,
          y: lm.y,
          confidence: lm.confidence,
          occluded: lm.occluded
        };
      }
      const mapHand = (side, h) => ({
        side,
        visible: Boolean(h?.visible ?? true),
        confidence: Number(h?.confidence ?? 0.8),
        wristAngleDeg: Number(h?.wristAngleDeg ?? 0),
        palmOrientation: String(h?.palmOrientation ?? "forward"),
        gestureLabel: String(h?.gestureLabel ?? "Detected Hand"),
        contactTarget: String(h?.contactTarget ?? "none"),
        fingerCurl: {
          thumb: Number(h?.thumbCurl ?? 0.15),
          index: Number(h?.indexCurl ?? 0.15),
          middle: Number(h?.middleCurl ?? 0.15),
          ring: Number(h?.ringCurl ?? 0.15),
          pinky: Number(h?.pinkyCurl ?? 0.15)
        },
        fingerSpread: Number(h?.fingerSpread ?? 0.25)
      });
      res.json({
        provider: "gemini-vision",
        imageWidth: imageWidth ?? 1e3,
        imageHeight: imageHeight ?? 1e3,
        subjects: (data.subjects || []).map((s) => ({
          id: Number(s.id ?? 1),
          label: String(s.label ?? "Subject"),
          bbox: [Number(s.xmin ?? 0.2), Number(s.ymin ?? 0.1), Number(s.xmax ?? 0.8), Number(s.ymax ?? 0.9)],
          poseType: String(s.poseType ?? "standing"),
          facingDirection: String(s.facingDirection ?? "front"),
          confidence: Number(s.confidence ?? 0.9)
        })),
        selectedSubjectId: Number(data.selectedSubjectId ?? targetSubjectId ?? 1),
        landmarks: formattedLandmarks,
        leftHand: mapHand("left", data.leftHand),
        rightHand: mapHand("right", data.rightHand),
        expression: data.expression,
        depthHints: data.depthHints,
        notes: data.notes ?? []
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Vision analysis failed.";
      res.status(500).json({ error: msg });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MMD Pose AI Studio server listening on http://0.0.0.0:${PORT}`);
  });
}
startServer();
