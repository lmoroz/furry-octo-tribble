window.sendFileButton = document.getElementById('send-file');
window.faqPanel = document.getElementById('faq');
if (window.sendFileButton && window.faqPanel) {
  window.faqPanel.classList.add('vv-app-handler')
  reportId = sendFileButton.dataset.purchase_id;
  window.uploadApp = document.createElement('div');
  window.uploadApp.id = 'spadminApp';
  window.faqPanel.prepend(window.uploadApp);

  function vvAppReposition() {
    document.getElementById('spadminApp').classList.toggle('sticky', (window.scrollY >= 120));
  }

  window.addEventListener('scroll', vvAppReposition);
  window.addEventListener('resize', vvAppReposition);
}
