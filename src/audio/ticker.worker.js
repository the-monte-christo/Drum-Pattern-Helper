// Taktgeber im Worker: wird im Hintergrund-Tab nicht wie setInterval im Main-Thread gedrosselt.
let timer = null;

self.onmessage = ({ data }) => {
  if (data === 'start' && timer === null) {
    timer = setInterval(() => self.postMessage('tick'), 25);
  } else if (data === 'stop' && timer !== null) {
    clearInterval(timer);
    timer = null;
  }
};
