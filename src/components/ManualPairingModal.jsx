import React, { useState } from 'react';
import { manualPairDocuments } from '../services/apiHandler';
import { toast } from 'react-toastify';

const ManualPairingModal = ({ isOpen, onClose, unpaired, refreshDbCounts }) => {
  const [pairCode, setPairCode] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !unpaired) return null;

  const { id, documentType, paper_reference_key: refCode } = unpaired;
  const isPaperQP = documentType === 'Question Paper';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pairCode.trim()) {
      toast.warn('Please enter a partner reference code');
      return;
    }
    
    setLoading(true);
    
    try {
      // Determine which ID goes where based on the document type
      const payload = {
        qp_id: isPaperQP ? id : null,
        ms_id: !isPaperQP ? id : null,
        ref_code_override: pairCode.trim()
      };
      
      // Call the API endpoint
      const response = await manualPairDocuments(
        payload.qp_id, 
        payload.ms_id, 
        payload.ref_code_override
      );
      
      toast.success(`Successfully paired ${isPaperQP ? 'question paper' : 'marking scheme'} with partner document!`);
      
      // Refresh document counts after successful pairing
      if (refreshDbCounts) {
        await refreshDbCounts();
      }
      
      onClose(); // Close the modal
      setPairCode(''); // Reset the input
      
    } catch (error) {
      console.error('Manual pairing error:', error);
      toast.error(`Pairing failed: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">Manual Paper Pairing</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            disabled={loading}
          >
            ✕
          </button>
        </div>
        
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            This {isPaperQP ? 'Question Paper' : 'Marking Scheme'} needs a partner document.
          </p>
          <div className="bg-blue-50 p-3 rounded-md">
            <p className="font-medium">Current Reference Code:</p>
            <code className="block bg-gray-100 p-2 rounded mt-1 text-sm">{refCode || 'Not available'}</code>
          </div>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 mb-1 text-sm font-medium">
              Enter Partner Reference Code
            </label>
            <input 
              type="text"
              value={pairCode}
              onChange={(e) => setPairCode(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., 2021_0580_4_1"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter the exact reference code of the {isPaperQP ? 'Marking Scheme' : 'Question Paper'} to pair with.
            </p>
          </div>
          
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Pairing...' : 'Pair Documents'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualPairingModal;