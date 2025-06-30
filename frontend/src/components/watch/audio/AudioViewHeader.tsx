import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export const AudioViewHeader = () => {
    return (
        <div className="relative z-10 p-6">
            <Link
                to="/"
                className="inline-flex items-center text-gray-300 hover:text-white transition-colors group"
            >
                <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
                Back to Library
            </Link>
        </div>
    );
}; 