import * as mobilenet from '@tensorflow-models/mobilenet';
import '@tensorflow/tfjs';

let modelPromise: Promise<mobilenet.MobileNet> | null = null;

const HELMET_KEYWORDS = [
  'helmet',
  'crash helmet',
  'bicycle helmet',
  'motor scooter',
  'moped',
  'motorcycle',
  'safety helmet',
];

function getModel() {
  if (!modelPromise) {
    modelPromise = mobilenet.load({ version: 2, alpha: 1.0 });
  }
  return modelPromise;
}

export async function detectHelmetInVideo(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) {
    return {
      helmetDetected: false,
      confidence: 0,
      topLabel: 'waiting_for_camera',
      topScore: 0,
    };
  }

  const model = await getModel();
  const predictions = await model.classify(video, 3);

  const top = predictions[0] || { className: 'unknown', probability: 0 };
  const bestHelmet = predictions.reduce((best, prediction) => {
    const label = prediction.className.toLowerCase();
    const hasHelmetSignal = HELMET_KEYWORDS.some((keyword) => label.includes(keyword));
    if (!hasHelmetSignal) return best;
    if (prediction.probability > best.score) {
      return { score: prediction.probability, label: prediction.className };
    }
    return best;
  }, { score: 0, label: '' });

  return {
    helmetDetected: bestHelmet.score >= 0.2,
    confidence: bestHelmet.score,
    topLabel: top.className,
    topScore: top.probability,
    topPredictions: predictions,
  };
}
