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
                },
                onError: error =>
                {
                    Debug.LogError("XR triage request failed: " + error);
                }));
        }

        public void MarkEmsCalledAndSync()
        {
            m_Timeline.actionsTaken.emsCalled = true;

            StartCoroutine(m_ApiClient.UpdateIncidentTimeline(
                m_Timeline,
                onSuccess: envelope =>
                {
                    Debug.Log("Incident updated: " + envelope.incident.id);
                },
                onError: error =>
                {
                    Debug.LogError("Timeline update failed: " + error);
                }));
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
