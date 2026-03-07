using System;
using RescueSight.UnityHooks;
using UnityEngine;

namespace RescueSight.UnityHooks.Examples
{
    public class RescueSightQuest3HooksExample : MonoBehaviour
    {
        [SerializeField]
        RescueSightApiClient m_ApiClient;

        IncidentTimelineInput m_Timeline;

        void Awake()
        {
            m_Timeline = IncidentTimelineInput.CreateDefault();
        }

        public void EvaluatePossibleCardiacArrestScenario()
        {
            var answers = new TriageAnswers
            {
                responsive = false,
                breathingNormal = false,
                strokeSigns = new StrokeSigns
                {
                    faceDrooping = false,
                    armWeakness = false,
                    speechDifficulty = false
                },
                heartRelatedSigns = new HeartRelatedSigns
                {
                    chestDiscomfort = false,
                    shortnessOfBreath = false,
                    coldSweat = false,
                    nauseaOrUpperBodyDiscomfort = false
                }
            };

            StartCoroutine(m_ApiClient.SubmitQuest3Triage(
                answers,
                m_Timeline,
                onSuccess: response =>
                {
                    Debug.Log("XR pathway: " + response.triage.result.pathway);
                    Debug.Log("Overlay step count: " + response.overlaySteps.Length);
                    if (response.transitionGate != null && response.transitionGate.blocked)
                    {
                        Debug.Log("Critical progression blocked until checkpoints are acknowledged.");
                    }
                },
                onError: error =>
                {
                    Debug.LogError("XR triage request failed: " + error);
                },
                cvSignal: new CvSignalInput
                {
                    handPlacementStatus = "too_left",
                    placementConfidence = 0.86f,
                    compressionRateBpm = 94,
                    compressionRhythmQuality = "too_slow",
                    visibility = "full",
                    frameTimestampMs = (int)(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() % int.MaxValue)
                }));
        }

        public void MarkEmsCalledAndSync()
        {
            m_Timeline.actionsTaken.emsCalled = true;
            StartCoroutine(m_ApiClient.SetActionCompleted(
                IncidentActionKeys.EmsCalled,
                completed: true,
                onSuccess: response =>
                {
                    Debug.Log("Action synced for incident: " + response.incidentId);
                },
                onError: error =>
                {
                    Debug.LogError("Action sync failed: " + error);
                }));
        }

        public void MarkStrokeOnsetRecorded()
        {
            m_Timeline.actionsTaken.strokeOnsetRecorded = true;
            StartCoroutine(m_ApiClient.SetActionCompleted(
                IncidentActionKeys.StrokeOnsetRecorded,
                completed: true,
                onSuccess: response =>
                {
                    Debug.Log("Stroke-onset action synced: " + response.incidentId);
                },
                onError: error =>
                {
                    Debug.LogError("Stroke-onset action sync failed: " + error);
                },
                responderNotes: "Onset time recorded by bystander."));
        }

        public void RefreshOverlayFromServer()
        {
            StartCoroutine(m_ApiClient.RefreshOverlay(
                onSuccess: response =>
                {
                    Debug.Log("Overlay refreshed for incident: " + response.incidentId);
                },
                onError: error =>
                {
                    Debug.LogError("Overlay refresh failed: " + error);
                }));
        }
    }
}
