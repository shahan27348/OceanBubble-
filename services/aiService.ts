
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Type } from "@google/genai";
import { StrategicHint, AiResponse, DebugInfo } from "../types";

// Corrected SDK initialization to follow the singleton pattern and coding guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_NAME = "gemini-3-flash-preview";
const MAX_RETRIES = 3;

export interface TargetCandidate {
  id: string;
  color: string;
  size: number;
  row: number;
  col: number;
  pointsPerBubble: number;
  description: string;
  avalancheCount?: number;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getStrategicHint = async (
  imageBase64: string,
  validTargets: TargetCandidate[], // Now contains candidates for ALL colors
  dangerRow: number
): Promise<AiResponse> => {
  const startTime = performance.now();
  
  // Default debug info container
  const debug: DebugInfo = {
    latency: 0,
    screenshotBase64: imageBase64, // Keep the raw input for display
    promptContext: "",
    rawResponse: "",
    timestamp: new Date().toLocaleTimeString()
  };

  // Local Heuristic Fallback
  const getBestLocalTarget = (msg: string = "No clear shots—play defensively."): StrategicHint => {
    if (validTargets.length > 0) {
        // Sort by Total Potential Score (Size * Value) then Height
        const best = validTargets.sort((a,b) => {
            const scoreA = (a.size + (a.avalancheCount || 0)) * a.pointsPerBubble;
            const scoreB = (b.size + (b.avalancheCount || 0)) * b.pointsPerBubble;
            return (scoreB - scoreA) || (a.row - b.row);
        })[0];
        
        return {
            message: `Fallback: Select ${best.color.toUpperCase()} at Row ${best.row}`,
            rationale: "Selected based on highest potential cluster score and avalanche effect.",
            targetRow: best.row,
            targetCol: best.col,
            recommendedColor: best.color as any
        };
    }
    return { message: msg, rationale: "No valid clusters found to target." };
  };

  const hasDirectTargets = validTargets.length > 0;

  const targetListStr = hasDirectTargets 
    ? validTargets.map(t => 
        `- OPTION: Select ${t.color.toUpperCase()} (${t.pointsPerBubble} pts/bubble) -> Target [Row ${t.row}, Col ${t.col}]. Cluster Size: ${t.size}. Potential Avalanche: ${t.avalancheCount || 0} bubbles.`
      ).join("\n")
    : "NO MATCHES AVAILABLE. Suggest a color to set up a future combo.";
  
  debug.promptContext = targetListStr;

  const prompt = `
    You are a strategic gaming AI analyzing a Bubble Shooter game.
    I have provided a screenshot and a list of valid targets (hittable bubbles).
    Each target belongs to a cluster. Some targets have a "Potential Avalanche" count, which means hitting that cluster will drop that many extra disconnected bubbles.

    ### GAME STATE
    - Danger Level: ${dangerRow >= 6 ? "CRITICAL (Bubbles near bottom!)" : "Stable"}
    
    ### SCORING RULES
    - Red: 100 pts
    - Blue: 150 pts
    - Green: 200 pts
    - Yellow: 250 pts
    - Purple: 300 pts
    - Orange: 500 pts (High Value Target!)

    ### AVAILABLE MOVES
    ${targetListStr}

    ### YOUR TASK
    Analyze the board and choose the BEST color and target.
    
    Prioritize:
    1. **Big Avalanches**: Dropping many bubbles at once is the most effective strategy.
    2. **High Value Pops**: Target Orange/Purple if they have clear paths.
    3. **Survival**: If Danger is CRITICAL, pop the lowest bubbles immediately.

    ### OUTPUT FORMAT
    Return RAW JSON only.
    JSON structure:
    {
      "message": "Operational directive",
      "rationale": "Strategic benefit explanation including avalanche size if applicable",
      "recommendedColor": "red|blue|green|yellow|purple|orange",
      "targetRow": integer,
      "targetCol": integer
    }
  `;

  // Strip the data:image/png;base64, prefix if present
  const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

  let attempts = 0;
  let lastError: any = null;

  while (attempts <= MAX_RETRIES) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: {
          parts: [
              { text: prompt },
              { 
                inlineData: {
                  mimeType: "image/png",
                  data: cleanBase64
                } 
              }
          ]
        },
        config: {
          temperature: 0.4,
          responseMimeType: "application/json" 
        }
      });

      const endTime = performance.now();
      debug.latency = Math.round(endTime - startTime);
      
      let text = response.text || "{}";
      debug.rawResponse = text;
      
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          text = text.substring(firstBrace, lastBrace + 1);
      } 

      const json = JSON.parse(text);
      debug.parsedResponse = json;
      
      const r = Number(json.targetRow);
      const c = Number(json.targetCol);
      
      if (!isNaN(r) && !isNaN(c) && json.recommendedColor) {
          return {
              hint: {
                  message: json.message || "Good shot available!",
                  rationale: json.rationale,
                  targetRow: r,
                  targetCol: c,
                  recommendedColor: json.recommendedColor.toLowerCase()
              },
              debug
          };
      }
      
      throw new Error("Invalid response coordinates or color");

    } catch (error: any) {
      lastError = error;
      attempts++;
      
      if (attempts <= MAX_RETRIES) {
        const backoffTime = Math.pow(2, attempts - 1) * 1000;
        await delay(backoffTime);
      } else {
        const endTime = performance.now();
        debug.latency = Math.round(endTime - startTime);
        return {
            hint: getBestLocalTarget(error.message.includes("JSON") ? "AI response parse error" : "AI Service Error"),
            debug: { ...debug, error: `Final Attempt Error: ${error.message}` }
        };
      }
    }
  }

  return {
    hint: getBestLocalTarget("Unknown error"),
    debug: { ...debug, error: "Exited retry loop without result" }
  };
};
