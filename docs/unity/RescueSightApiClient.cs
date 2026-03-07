using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace RescueSight.UnityHooks
{
    [Serializable]
    public class StrokeSigns
    {
        public bool faceDrooping;
        public bool armWeakness;
        public bool speechDifficulty;
    }

    [Serializable]
    public class HeartRelatedSigns
    {
        public bool chestDiscomfort;
        public bool shortnessOfBreath;
        public bool coldSweat;
        public bool nauseaOrUpperBodyDiscomfort;
    }

    [Serializable]
    public class TriageAnswers
    {
        public bool responsive;
        public bool breathingNormal;
        public StrokeSigns strokeSigns = new StrokeSigns();
        public HeartRelatedSigns heartRelatedSigns = new HeartRelatedSigns();
    }

    [Serializable]
    public class IncidentActionsTaken
    {
        public bool emsCalled;
        public bool cprStarted;
        public bool aedRequested;
        public bool aedArrived;
        public bool strokeOnsetRecorded;
    }

    [Serializable]
    public class IncidentTimelineInput
    {
        public string firstObservedAtLocal = "";
        public string responderNotes = "";
        public string aedStatus = "unknown";
        public IncidentActionsTaken actionsTaken = new IncidentActionsTaken();

        public static IncidentTimelineInput CreateDefault()
        {
            return new IncidentTimelineInput
            {
                firstObservedAtLocal = "",
                responderNotes = "",
                aedStatus = "unknown",
                actionsTaken = new IncidentActionsTaken()
            };
        }
    }

    [Serializable]
    public class XrDeviceContext
    {
        public string deviceModel = "meta_quest_3";
        public string interactionMode = "hands";
        public string appVersion = "0.1.0";
        public string unityVersion = "6000.3.10f1";
    }

    [Serializable]
    public class XrTriageHookRequest
    {
        public TriageAnswers answers;
        public string incidentId;
        public IncidentTimelineInput timeline;
        public XrDeviceContext deviceContext;
        public CvSignalInput cvSignal;
        public string[] acknowledgedCheckpoints;
    }

    [Serializable]
    public class CvSignalInput
    {
        public string handPlacementStatus = "unknown";
        public float placementConfidence = 0.0f;
        public int compressionRateBpm = 0;
        public string compressionRhythmQuality = "unknown";
        public string visibility = "poor";
        public int frameTimestampMs = 0;
    }

    [Serializable]
    public class XrCvHint
    {
        public string status;
        public string directive;
        public string message;
    }

    [Serializable]
    public class XrCvCheckpoint
    {
        public string id;
        public string prompt;
        public string severity;
        public string suggestedAction;
        public bool acknowledged;
    }

    [Serializable]
    public class XrCvAssist
    {
        public XrCvHint personDownHint;
        public XrCvHint handPlacementHint;
        public XrCvHint compressionHint;
        public XrCvHint visibilityHint;
        public XrCvCheckpoint[] checkpoints;
        public bool requiresUserConfirmation;
        public string safetyNotice;
        public int frameTimestampMs;
    }

    [Serializable]
    public class XrTransitionGate
    {
        public bool blocked;
        public string reason;
        public string[] requiredCheckpointIds;
    }

    [Serializable]
    public class CprGuidance
    {
        public int[] targetBpmRange;
        public string[] instructions;
    }

    [Serializable]
    public class TriageResult
    {
        public string pathway;
        public string label;
        public string urgency;
        public string summary;
        public string[] immediateActions;
        public string[] followUpActions;
        public CprGuidance cprGuidance;
        public string safetyNotice;
    }

    [Serializable]
    public class TriageEvaluationResponse
    {
        public TriageResult result;
        public string evaluatedAtIso;
    }

    [Serializable]
    public class XrOverlayAnchor
    {
        public string kind;
        public string target;
    }

    [Serializable]
    public class XrOverlayStep
    {
        public string id;
        public string text;
        public string source;
        public string priority;
        public XrOverlayAnchor anchor;
        public bool requiresConfirmation;
        public string linkedAction;
        public bool completed;
    }

    [Serializable]
    public class IncidentTimeline
    {
        public string firstObservedAtLocal;
        public string responderNotes;
        public string aedStatus;
        public IncidentActionsTaken actionsTaken;
    }

    [Serializable]
    public class XrTriageHookResponse
    {
        public string incidentId;
        public TriageEvaluationResponse triage;
        public XrOverlayStep[] overlaySteps;
        public CprGuidance cprGuidance;
        public IncidentTimeline timeline;
        public XrCvAssist cvAssist;
        public XrTransitionGate transitionGate;
        public string safetyNotice;
    }

    [Serializable]
    public class XrIncidentOverlayResponse
    {
        public string incidentId;
        public TriageEvaluationResponse triage;
        public XrOverlayStep[] overlaySteps;
        public IncidentTimeline timeline;
        public XrCvAssist cvAssist;
        public XrTransitionGate transitionGate;
        public string safetyNotice;
    }

    [Serializable]
    public class XrIncidentActionUpdateRequest
    {
        public string actionKey;
        public bool completed;
        public string aedStatus;
        public string responderNotes;
    }

    public static class IncidentActionKeys
    {
        public const string EmsCalled = "emsCalled";
        public const string CprStarted = "cprStarted";
        public const string AedRequested = "aedRequested";
        public const string AedArrived = "aedArrived";
        public const string StrokeOnsetRecorded = "strokeOnsetRecorded";
    }

    [Serializable]
    public class UpdateIncidentRequest
    {
        public IncidentTimelineInput timeline;
        public string handoffSummary;
        public string status = "open";
    }

    [Serializable]
    public class IncidentRecord
    {
        public string id;
        public string status;
        public IncidentTimeline timeline;
    }

    [Serializable]
    public class IncidentEnvelope
    {
        public IncidentRecord incident;
    }

    public class RescueSightApiClient : MonoBehaviour
    {
        [SerializeField]
        string m_ApiBaseUrl = "http://192.168.1.100:8080";

        [SerializeField]
        string m_AppVersion = "0.1.0";

        [SerializeField]
        string m_UnityVersion = "6000.3.10f1";

        [SerializeField]
        string m_InteractionMode = "hands";

        public string CurrentIncidentId { get; private set; }

        public void SetIncidentId(string incidentId)
        {
            CurrentIncidentId = incidentId;
        }

        public IEnumerator SubmitQuest3Triage(
            TriageAnswers answers,
            IncidentTimelineInput timeline,
            Action<XrTriageHookResponse> onSuccess,
            Action<string> onError,
            CvSignalInput cvSignal = null,
            string[] acknowledgedCheckpoints = null)
        {
            var payload = new XrTriageHookRequest
            {
                answers = answers,
                incidentId = CurrentIncidentId,
                timeline = timeline,
                cvSignal = cvSignal,
                acknowledgedCheckpoints = acknowledgedCheckpoints,
                deviceContext = new XrDeviceContext
                {
                    deviceModel = "meta_quest_3",
                    interactionMode = m_InteractionMode,
                    appVersion = m_AppVersion,
                    unityVersion = m_UnityVersion
                }
            };

            yield return SendJson("POST", "/api/xr/triage", payload, (XrTriageHookResponse response) =>
            {
                CurrentIncidentId = response.incidentId;
                onSuccess?.Invoke(response);
            }, onError);
        }

        public IEnumerator RefreshOverlay(
            Action<XrIncidentOverlayResponse> onSuccess,
            Action<string> onError)
        {
            if (string.IsNullOrWhiteSpace(CurrentIncidentId))
            {
                onError?.Invoke("No incident id is available. Call SubmitQuest3Triage first.");
                yield break;
            }

            var path = "/api/xr/incidents/" + UnityWebRequest.EscapeURL(CurrentIncidentId) + "/overlay";
            yield return SendJson("GET", path, null, onSuccess, onError);
        }

        public IEnumerator UpdateIncidentTimeline(
            IncidentTimelineInput timeline,
            Action<IncidentEnvelope> onSuccess,
            Action<string> onError)
        {
            if (string.IsNullOrWhiteSpace(CurrentIncidentId))
            {
                onError?.Invoke("No incident id is available. Call SubmitQuest3Triage first.");
                yield break;
            }

            var payload = new UpdateIncidentRequest
            {
                timeline = timeline,
                status = "open"
            };

            var path = "/api/incidents/" + UnityWebRequest.EscapeURL(CurrentIncidentId);
            yield return SendJson("PATCH", path, payload, onSuccess, onError);
        }

        public IEnumerator SetActionCompleted(
            string actionKey,
            bool completed,
            Action<XrIncidentOverlayResponse> onSuccess,
            Action<string> onError,
            string aedStatus = null,
            string responderNotes = null)
        {
            if (string.IsNullOrWhiteSpace(CurrentIncidentId))
            {
                onError?.Invoke("No incident id is available. Call SubmitQuest3Triage first.");
                yield break;
            }

            if (string.IsNullOrWhiteSpace(actionKey))
            {
                onError?.Invoke("actionKey is required.");
                yield break;
            }

            var payload = new XrIncidentActionUpdateRequest
            {
                actionKey = actionKey,
                completed = completed,
                aedStatus = aedStatus,
                responderNotes = responderNotes
            };

            var path = "/api/xr/incidents/" + UnityWebRequest.EscapeURL(CurrentIncidentId) + "/actions";
            yield return SendJson("PATCH", path, payload, onSuccess, onError);
        }

        IEnumerator SendJson<T>(
            string method,
            string path,
            object payload,
            Action<T> onSuccess,
            Action<string> onError)
        {
            var url = BuildUrl(path);
            var request = new UnityWebRequest(url, method);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");

            if (payload != null)
            {
                var bodyJson = JsonUtility.ToJson(payload);
                var bodyRaw = Encoding.UTF8.GetBytes(bodyJson);
                request.uploadHandler = new UploadHandlerRaw(bodyRaw);
            }

            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                onError?.Invoke("HTTP " + request.responseCode + ": " + request.error);
                yield break;
            }

            var json = request.downloadHandler != null ? request.downloadHandler.text : "";
            if (string.IsNullOrWhiteSpace(json))
            {
                onError?.Invoke("Response body was empty.");
                yield break;
            }

            T parsed;
            try
            {
                parsed = JsonUtility.FromJson<T>(json);
            }
            catch (Exception ex)
            {
                onError?.Invoke("Failed to parse JSON response: " + ex.Message);
                yield break;
            }

            if (parsed == null)
            {
                onError?.Invoke("Failed to parse JSON response.");
                yield break;
            }

            onSuccess?.Invoke(parsed);
        }

        string BuildUrl(string path)
        {
            var baseUrl = m_ApiBaseUrl.TrimEnd('/');
            var normalizedPath = path.StartsWith("/") ? path : "/" + path;
            return baseUrl + normalizedPath;
        }
    }
}
