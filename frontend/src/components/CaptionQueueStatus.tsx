import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { mediaAPI, CaptionQueueItem } from '../lib/api';
import { Clock, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card } from './common';

export function CaptionQueueStatus() {
  const { user } = useAuth();
  const [queueItems, setQueueItems] = useState<CaptionQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchQueueStatus();
    }
  }, [user]);

  const fetchQueueStatus = async () => {
    try {
      const response = await mediaAPI.getUserCaptionQueue();
      if (response.data.success) {
        setQueueItems(response.data.data);
      } else {
        setError('Failed to fetch queue status');
      }
    } catch (err) {
      setError('Failed to fetch queue status');
      console.error('Queue status error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await mediaAPI.cancelCaptionJob(jobId);
      // Refresh the queue status
      fetchQueueStatus();
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'QUEUED':
        return <Clock className="w-4 h-4 text-yellow-400" />;
      case 'PROCESSING':
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'COMPLETED':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'FAILED':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'CANCELLED':
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'QUEUED':
        return 'Queued';
      case 'PROCESSING':
        return 'Processing';
      case 'COMPLETED':
        return 'Completed';
      case 'FAILED':
        return 'Failed';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const formatEstimatedTime = (minutes: number) => {
    if (minutes < 1) return 'Less than a minute';
    if (minutes < 60) return `~${Math.round(minutes)} minutes`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = Math.round(minutes % 60);
    return `~${hours}h ${remainingMinutes}m`;
  };

  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <Card variant="default" className="p-4">
        <div className="flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          <span className="ml-2 text-gray-400">Loading caption queue...</span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="default" className="p-4 border-red-500/20">
        <div className="flex items-center text-red-400">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
        </div>
        <button
          onClick={fetchQueueStatus}
          className="mt-2 text-sm text-blue-400 hover:text-blue-300"
        >
          Try again
        </button>
      </Card>
    );
  }

  if (queueItems.length === 0) {
    return (
      <Card variant="default" className="p-4">
        <div className="text-center text-gray-400">
          <Clock className="w-8 h-8 mx-auto mb-2" />
          <p>No items in caption queue</p>
          <button
            onClick={fetchQueueStatus}
            className="mt-2 text-sm text-blue-400 hover:text-blue-300"
          >
            Refresh
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="default" className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Caption Queue Status</h3>
        <button
          onClick={fetchQueueStatus}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Refresh
        </button>
      </div>
      
      <div className="space-y-3">
        {queueItems.map((item) => (
          <div key={item.jobId} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
            <div className="flex items-center space-x-3 flex-1">
              {getStatusIcon(item.status)}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">
                  {item.mediaItem.title}
                </p>
                <div className="flex items-center space-x-4 text-sm text-gray-400">
                  <span>{getStatusText(item.status)}</span>
                  {item.status === 'QUEUED' && (
                    <>
                      <span>•</span>
                      <span>Position: {item.queuePosition}</span>
                      <span>•</span>
                      <span>ETA: {formatEstimatedTime(item.estimatedWaitTime)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {item.status === 'QUEUED' && (
              <button
                onClick={() => handleCancelJob(item.jobId)}
                className="ml-3 px-3 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        ))}
      </div>
      
      <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
        <p className="text-xs text-blue-300 text-center">
          📝 Captions are generated automatically using AI. Check back later or refresh to see updates.
        </p>
      </div>
    </Card>
  );
} 