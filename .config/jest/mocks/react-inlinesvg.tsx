import React from 'react';

const SVG_FILE_NAME_REGEX = /(.+)\/(.+)\.svg$/;

const InlineSVG = ({ src }: { src: string }) => {
  const testId = src.replace(SVG_FILE_NAME_REGEX, '$2');
  return <svg xmlns="http://www.w3.org/2000/svg" data-testid={testId} viewBox="0 0 24 24" />;
};

export default InlineSVG;
