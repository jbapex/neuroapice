import React from 'react';

const FlowLayout = ({ children }) => {
  return (
    <main className="w-full max-w-full min-h-screen h-screen overflow-hidden bg-background">
      {children}
    </main>
  );
};

export default FlowLayout;