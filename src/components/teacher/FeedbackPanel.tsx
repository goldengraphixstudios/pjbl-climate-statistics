import React, { useState } from 'react';
import { getFeedbackForStudentActivity, upsertFeedback } from '../../services/feedbackService';
import { ActivityType } from '../../services/responsesService';

interface FeedbackPanelProps {
  studentId: string;
  studentName: string;
  activityType: ActivityType;
  onClose: () => void;
  onSubmitSuccess: () => void;
}

const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
  studentId,
  studentName,
  activityType,
  onClose,
  onSubmitSuccess
}) => {
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [hasExistingFeedback, setHasExistingFeedback] = useState(false);

  React.useEffect(() => {
    const loadExisting = async () => {
      try {
        const existing = await getFeedbackForStudentActivity(studentId, activityType);
        setHasExistingFeedback(!!existing?.feedback_text);
        if (existing?.feedback_text) {
          setFeedbackText(existing.feedback_text);
        } else {
          setFeedbackText('');
        }
      } catch (err) {
        console.error('Error loading existing feedback:', err);
      }
    };
    loadExisting();
  }, [studentId, activityType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) {
      setError('Please enter feedback');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await upsertFeedback(studentId, activityType, feedbackText);
      setSuccess(true);
      setFeedbackText('');
      setTimeout(() => {
        onSubmitSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activityLabels: Record<ActivityType, string> = {
    pre: 'Pre-Assessment',
    lesson1: 'Lesson 1',
    lesson2: 'Lesson 2',
    lesson3: 'Lesson 3',
    post: 'Post-Assessment'
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '32px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 700 }}>
              Submit Feedback
            </h2>
            <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
              To: <strong>{studentName}</strong> ({activityLabels[activityType]})
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#999',
              padding: 0
            }}
          >
            ✕
          </button>
        </div>

        {success ? (
          <div style={{
            padding: '20px',
            backgroundColor: '#E8F5E9',
            color: '#2E7D32',
            borderRadius: '4px',
            textAlign: 'center',
            marginBottom: '20px'
          }}>
            ✓ Feedback submitted successfully!
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: 600,
                color: '#333'
              }}>
                Feedback Message
              </label>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Write your feedback here. Be constructive and supportive..."
                style={{
                  width: '100%',
                  minHeight: '150px',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div style={{
                padding: '12px',
                backgroundColor: '#FFEBEE',
                color: '#C62828',
                borderRadius: '4px',
                marginBottom: '20px',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  color: '#333',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  opacity: isSubmitting ? 0.5 : 1
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: '#1976D2',
                  color: 'white',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  opacity: isSubmitting ? 0.7 : 1
                }}
              >
                {isSubmitting ? 'Submitting...' : hasExistingFeedback ? 'Update Feedback' : 'Submit Feedback'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackPanel;
