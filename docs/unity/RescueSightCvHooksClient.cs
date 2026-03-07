using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace RescueSight.UnityHooks
{
    [Serializable]
    public class CvSignalPayload
    {
        public string handPlacementStatus = "unknown";
        public float placementConfidence = 0.0f;
        public int compressionRateBpm = 0;
        public string compressionRhythmQuality = "unknown";
        public string visibility = "poor";
        public int frameTimestampMs = 0;
    }

    [Serializable]
    public class CvHookRequest
    {
        public CvSignalPayload signal;
        public string[] acknowledgedCheckpoints;
        public string source = "quest3";
    }

    [Serializable]
    public class PersonDownHint
    {
        public string status;
        public float confidence;
        public string message;
    }

    [Serializable]
    public class HandPlacementHint
    {
        public string directive;
        public string message;
    }

    [Serializable]
    public class CompressionHint
    {
        public string directive;
        public string message;
    }

    [Serializable]
    public class VisibilityHint
    {
        public string status;
        public string message;
    }

    [Serializable]
    public class ConfirmationCheckpoint
    {
        public string id;
        public string prompt;
        public string severity;
        public string suggestedAction;
    }

    [Serializable]
    public class CvHookResponse
    {
        public PersonDownHint personDownHint;
        public HandPlacementHint handPlacementHint;
        public CompressionHint compressionHint;
        public VisibilityHint visibilityHint;
        public ConfirmationCheckpoint[] checkpoints;
        public bool requiresUserConfirmation;
        public string safetyNotice;
        public int frameTimestampMs;
    }

    public class RescueSightCvHooksClient : MonoBehaviour
    {
        [SerializeField]
        string m_CvServiceBaseUrl = "http://192.168.1.100:8091";

        [SerializeField]
        string m_Source = "quest3";

        public IEnumerator EvaluateCvSignal(
            CvSignalPayload signal,
            Action<CvHookResponse> onSuccess,
            Action<string> onError,
            string[] acknowledgedCheckpoints = null)
        {
            if (signal == null)
            {
                onError?.Invoke("signal is required.");
                yield break;
            }

            var payload = new CvHookRequest
            {
                signal = signal,
                acknowledgedCheckpoints = acknowledgedCheckpoints,
                source = m_Source
            };

            yield return SendJson(
                "POST",
                "/api/cv/evaluate",
                payload,
                onSuccess,
                onError
            );
        }

        public IEnumerator CheckHealth(
            Action<string> onSuccess,
            Action<string> onError)
        {
            var url = BuildUrl("/health");
            var request = new UnityWebRequest(url, "GET");
            request.downloadHandler = new DownloadHandlerBuffer();

            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                onError?.Invoke("HTTP " + request.responseCode + ": " + request.error);
                yield break;
            }

            var body = request.downloadHandler != null ? request.downloadHandler.text : "";
            onSuccess?.Invoke(body);
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
            var baseUrl = m_CvServiceBaseUrl.TrimEnd('/');
            var normalizedPath = path.StartsWith("/") ? path : "/" + path;
            return baseUrl + normalizedPath;
        }
    }
}
