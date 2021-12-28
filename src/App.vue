<template>
  <div id="spadminApp">
    <button ref="uploadButton"
            class="spadmin-button"
            :class="[ status, status.match(/loading/) ? 'loading' : '' ]"
            :disabled="disabled"
            @click="processOrders"></button>
    <button v-if="reportExists" ref="reportButton" class="spadmin-button" @click="openReport">Отчёт о добавлении в корзину</button>

    <input type="search" class="vv_search-field" size="34" placeholder="Фильтр заказов по тексту/участнику"
           v-debounce:500ms.fireonempty="filterRows"
           v-model="ordersFilterText"
           autocomplete="off">

    <button class="spadmin-button" @click="checkUncheckAll">
      {{ statusChecked && checkedOrdersCheckboxes.size ? 'Снять выделение' : 'Выделить все' }}
    </button>

    <select v-model="selectedOrdersStatus" class="vv-order-status-select" v-show="checkedOrdersCheckboxes.size">
      <option value=''>Установить статус выделенным ({{ checkedOrdersCheckboxes.size }}) в:</option>
      <option v-for="(orderStatus, key, index) in ordersStatusList"
              :key="index"
              :data-index="index"
              :value="orderStatus.value"
              :style="{ color: orderStatus.style.color }"
              :data-value-id="orderStatus.id+1">
        {{ orderStatus.title }}
      </option>
    </select>
    <button v-show="checkedOrdersCheckboxes.size&&selectedOrdersStatus" class="spadmin-button clean" @click="submitOrdersStatuses">
      OK
    </button>
  </div>
</template>


<script>

import Swal from 'sweetalert2';
import fetchTimeout from 'fetch-timeout';

const punycode = window.punycode;

export default {
  name: 'App',
  components: {},
  data() {
    return {
      site: 'superpuper.ru',
      reportOrders: false,
      reportId: false,
      userId: false,
      orderStateRegexps: {new: /Новый/i, fixed: /Зафиксировано/i, checked: 'Все отмеченные', all: 'Все'},
      selectStatus: false,
      orderStatuses: {new: 0, fix: 1, accepted: 2, declined: 3},
      reportExists: false,
      reportLink: false,
      status: 'iddle',
      spadminOrdersSite: false,
      spadminOrdersSiteVisible: false,
      reportCatalogues: [],
      selectedCatalogue: 'all',
      choosedToFixOrders: false,
      successMessages: [],
      ordersFilterText: '',
      ordersRows: [],
      ordersUsers: new Set(),
      statusChecked: false,
      ordersStatusList: [],
      selectedOrdersStatus: '',
      selected_orders_status_selector: null,
      reportTable: null,
      checkedOrdersCheckboxes: new Set(),
    };
  },
  methods: {
    checkUncheckAll: function() {
      this.statusChecked = !this.statusChecked;
      window.spadmin.log.info('checkUncheckAll fired! new statusChecked = ', this.statusChecked);
      this.ordersRows.forEach(rowData => {
        const rowCheckbox = rowData.row.querySelector('input[type="checkbox"]');
        if (rowCheckbox) rowCheckbox.checked = this.statusChecked;
      });
      if (!this.statusChecked) this.selectedOrdersStatus = '';
      this.reportTable.dispatchEvent(new Event('change'));
    },
    watchCheckboxesStatus: function(event) {
      const elementId = event.target.id;

      if (event.target.type === 'checkbox' || event.target === this.reportTable) {
        this.checkedOrdersCheckboxes = new Set([
          ...Array.from(this.reportTable.querySelectorAll('input[type="checkbox"][id$="_select"]'))
              .filter(el => el.checked)
              .map(el => el.id),
        ]);

        window.spadmin.log.info('watchCheckboxesStatus', this.checkedOrdersCheckboxes);
      }
    },
    submitOrdersStatuses: function() {
      window.change_selected_orders_state();
    },
    setStatus: function(newStatus) {
      this.status = `loading-${ newStatus }`;
    },
    resetStatus: function() {
      this.status = 'iddle';
    },
    logError: function(data) {
      window.spadmin.log.error(data);
    },
    reportError: async function(text) {
      this.resetStatus();
      return await Swal.fire({
        title: 'Ой…',
        html: text,
        icon: 'error',
      });
    },
    reportErrorPass: async function(text) {
      return Swal.fire({
        title: 'Ой…',
        html: text,
        icon: 'error',
      });
    },
    reportOk: async function(text) {
      return await Swal.fire({
            title: 'Ok!',
            html: text,
            icon: 'success',
          },
      );
    },
    reportInfo: async function(title, text) {
      return await Swal.fire({
            title,
            html: text,
            icon: 'warning',
          },
      );
    },
    createRequestData: function(formBody) {
      return {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: formBody,
      };
    },
    openReport: function() {
      if (this.reportLink) window.open(this.reportLink, '_blank');
    },
    formatHTMLReport: function(site, report) {
      return `
        <h3 class="info2">Отчёт о корректировке цен ${ site } от ${ new Date().toLocaleString('ru-RU') }:</h3>
        <section>
          ${ report }
        </section>`;
    },
    joinReport: async function() {
      this.setStatus('upload');

      if (this.successMessages.length) {

        const data = this.successMessages.join('<br>');
        const reportHTML = this.formatHTMLReport(this.spadminOrdersSite, data);

        const req = await fetch('https://spadmin.org/superpuper.ru/orderUploader/joinReport/' + this.spadminOrdersSite, {
          method: 'POST',
          body: JSON.stringify({
            joinReport: reportHTML,
          }),
        }).catch(this.reportError);
        const resp = await req.json().catch(this.reportError);
        if (!resp.ok) {
          this.resetStatus();
          throw new Error(resp.message);
        }
      }
      return true;
    },
    getReport: async function() {
      if (!this.spadminOrdersSite) return false;
      const req = await fetch('https://spadmin.org/superpuper.ru/orderUploader/getReport/' + this.spadminOrdersSite, {
        method: 'POST',
        body: JSON.stringify({
          action: 'getReport',
        }),
      }).catch(this.reportError);
      const resp = await req.json().catch(this.reportError);
      if (resp.ok) {
        this.reportLink = resp.data;
        this.reportExists = true;
        return this.reportLink;
      }
      return false;
    },
    createPostBody: function(data) {
      let formBody = [];
      if ('orders' in data) {
        let ordersToPost = [];
        Object.keys(data.orders).forEach(key => {
          data.orders[key].forEach(currentOrder => {
            if (currentOrder.orderId) ordersToPost.push(currentOrder.orderId);
            else {
              window.spadmin.log.error('Не найден orderId! currentOrder = ', currentOrder);
            }
          });
        });
        window.spadmin.log.info({ordersToPost});
        data.orders = ordersToPost.join(',');
      }
      for (let property in data) {
        var encodedKey = encodeURIComponent(property);
        var encodedValue = encodeURIComponent(data[property]);
        formBody.push(encodedKey + '=' + encodedValue);
      }
      formBody = formBody.join('&');
      return formBody;
    },
    addToOrders: async function(row) {
      window.spadmin.log.info('addToOrders()', row);
      try {
        const orderRowId = row.id;
        if (!orderRowId) {
          this.logError({row});
          throw new Error('ID заказа не найден');
        }

        const orderId = orderRowId.match(/(\d+)/i)[1];
        if (!orderId) {
          this.logError({orderRowId, row});
          throw new Error('ID заказа не найден');
        }

        const orderStatus = row.querySelector('select.order-states option[selected]').innerText;
        if (!orderStatus) {
          this.logError({row});
          throw new Error('Статус заказа не найден');
        }

        const orderPrice = row.querySelector('input[id$="_lot_cost"]').value;
        if (!orderPrice) {
          this.logError({row});
          throw new Error('Цена товара не найдена');
        }

        const orderChecked = row.querySelector('input.order-select')?.checked;
        if (this.selectStatus === 'checked' && !orderChecked) {
          window.spadmin.log.info('addToOrders() » this.selectStatus = ', this.selectStatus,
              '; orderChecked = ', orderChecked,
              ' => passthrou');
          return 'ok';
        }

        const orderUserId = row.querySelector('a[href*="memberlist.php"]')?.innerText;
        if (!orderUserId) {
          this.logError({row});
          throw new Error('ID участника СП для заказа №' + orderId + ' не найден');
        }

        const orderCatalogue = row.querySelector('a[title^="Перейти в каталог"]')?.innerText;
        if (this.selectedCatalogue !== 'all' && orderCatalogue !== this.selectedCatalogue) {
          window.spadmin.log.info('addToOrders() » this.selectedCatalogue = ', this.selectedCatalogue,
              '; orderCatalogue = ', orderCatalogue,
              '; typeof this.selectedCatalogue = ', (typeof this.selectedCatalogue),
              '; (this.selectedCatalogue !== false && orderCatalogue !== this.selectedCatalogue) = ',
              (this.selectedCatalogue !== false && orderCatalogue !== this.selectedCatalogue),
              ' => passthrou');
          return 'ok';
        }

        const orderName = row.querySelector('a[title^="Перейти в каталог к модели"]')?.innerText.trim();
        if (!orderName) {
          this.logError({row});
          throw new Error('Наименование товара для заказа №' + orderId + ' не найдено');
        }

        let orderCodeElement = document.evaluate('//tr[@id=\'' + orderRowId + '\']//td[contains(., \'Код:\')]',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (!orderCodeElement)
          orderCodeElement = document.evaluate('//tr[@id=\'' + orderRowId + '\']//td[contains(., \'Артикул:\')]',
              document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

        const orderSizeElement = document.evaluate('//tr[@id=\'' + orderRowId + '\']//td[contains(., \'Размер:\')]',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        const orderOptsElement = document.evaluate('//tr[@id=\'' + orderRowId + '\']//td[contains(., \'Опции:\')]',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        const orderColorElement = document.evaluate('//tr[@id=\'' + orderRowId + '\']//td[contains(., \'Цвет:\')]',
            document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

        window.spadmin.log.info('addToOrders() » orderCodeElement = ', orderCodeElement,
            '; orderStatus = ', orderStatus,
            '; this.selectStatus = ', this.selectStatus,
            '; this.orderStateRegexps[this.selectStatus] = ', this.orderStateRegexps[this.selectStatus]);

        if (orderCodeElement) {
          let orderCodeMatch = orderCodeElement.innerText.match(/Код:\s*([^\r\n\t]+)/i);
          if (!orderCodeMatch) orderCodeMatch = orderCodeElement.innerText.match(/Артикул:\s*([^\r\n\t]+)/i);
          if (orderCodeMatch) {
            const orderCode = orderCodeMatch[1];

            let orderOption;
            if (orderSizeElement) orderOption = orderSizeElement.innerText.match(/Размер:\s*([^\r\n\t]+)/i)[1];
            else if (orderOptsElement) orderOption = orderOptsElement.innerText.match(/Опции:\s*([^\r\n\t]+)/i)[1];

            let orderColor;
            if (orderColorElement) orderColor = orderColorElement.innerText.match(/Цвет:\s*([^\r\n\t]+)/i)[1];

            if (this.selectStatus === 'all' ||
                (this.selectStatus === 'checked' && orderChecked) ||
                (this.selectStatus !== 'checked' && orderStatus.match(this.orderStateRegexps[this.selectStatus]))) {
              if (!(this.reportOrders[orderCode])) this.reportOrders[orderCode] = [];
              this.reportOrders[orderCode].push({
                orderRowId,
                orderUserId,
                orderId,
                orderName,
                orderCode,
                orderPrice,
                orderStatus,
                orderOption,
                orderColor,
                status: 'new',
              });
              //window.spadmin.log.info({orderRowId, orderUserId, orderCode, orderPrice, orderStatus, orderOption, orderColor, status: 'new'});
              return 'ok';
            }
            return orderStatus;
          } else {
            this.logError({orderCodeElement, orderRowId, row});
            throw new Error('Код/Артикул товара не найден');
          }
        } else {
          this.logError({orderRowId, row});
          throw new Error('Ячейка с кодом/артикулом товара не найдена');
        }
      } catch (e) {
        window.spadmin.log.error(e.message);
      }
    },

    fillOrders: async function() {
      this.reportOrders = {};
      this.setStatus('fill');

      const ordersRows = Array.from(this.reportTable.querySelectorAll('tr.order'));
      window.spadmin.log.info('reportOrders() this.selectStatus = ', this.selectStatus);
      window.spadmin.log.info('reportOrders() ordersRows = ', ordersRows);

      //return forEachAsync(ordersRows, async (row) => {console.log('forEachAsync row', row);}); //await this.addToOrders(row);
      return this.addRowsToOrders(ordersRows);
    },

    addRowsToOrders: async function(ordersRows) {
      if (ordersRows.length) {
        const currentRow = ordersRows.shift();
        await this.addToOrders(currentRow);
        return this.addRowsToOrders(ordersRows);
      }
      return true;
    },

    fixOrders: async function() {

      const formBody = this.createPostBody({cmd: 'change_orders_state', orders: this.reportOrders, new_state: 1});
      const requestData = this.createRequestData(formBody);
      await this.waitTimeout(1500);
      const req = await fetch('https://superpuper.ru/function.php', requestData);
      const resp = await req.json();
      if (resp.state === 'ok') return true;
      else return resp.message;

    },
    uploadOrders: async function() {
      const self = this;
      try {
        const req = await fetch('https://spadmin.org/superpuper.ru/orderUploader/fillOrders/' + this.spadminOrdersSite, {
          method: 'POST',
          body: JSON.stringify({
            reportId: this.reportId,
            reportOrders: this.reportOrders,
          }),
          headers: {
            'Content-type': 'application/json; charset=UTF-8',
          },
        });
        const resp = await req.json();
        window.spadmin.log.info({resp});
        if (resp.ok) {
          this.setStatus('await');
          if (this.reportExists) this.reportExists = false;
          this.reportOk(
              `Все указанные заказы выгружены в парсер<br><br>
Перейдите на <a href="//${self.spadminOrdersSite}" target="_blank">сайт поставщика</a>,<br>
! очистите корзину !<br>
и нажмите там кнопку<br>
«Выгрузить заказы в корзину»`);
          this.awaitFill();
        } else {
          this.resetStatus();
          this.reportError(resp.message);
        }
      } catch (e) {
        this.resetStatus();
        window.spadmin.log.error(e);
        this.reportError(e.message);
      }
    },
    waitTimeout: async function(timeout) {
      return new Promise((resolve) => setTimeout(resolve, timeout));
    },
    awaitFill: async function() {
      const req = await fetch('https://spadmin.org/superpuper.ru/orderUploader/fillAwait/' + this.spadminOrdersSite, {
        method: 'POST',
        body: JSON.stringify({
          reportId: this.reportId,
        }),
        headers: {
          'Content-type': 'application/json; charset=UTF-8',
        },
      });
      const resp = await req.json();
      if (resp.ok) {
        this.reportOrders = resp.data;
        this.finalyze();
      } else {
        window.setTimeout(() => {
          window.requestAnimationFrame(() => {
            this.awaitFill();
          });
        }, 5000);
      }
    },
    processOrders: async function(event) {
      event.preventDefault();

      if (!this.reportId) {
        this.reportError('Не найден идентификатор (номер) отчёта');
        this.resetStatus();
        return;
      }
      const siteSelected = await Swal.fire({
        title: 'Адрес (домен) сайта поставщика<br><small class="spadmin-small spadmin-block">без http и www. (например: gela.ru)</small>',
        input: 'text',
        icon: 'question',
        //inputLabel: '',
        inputValue: localStorage.getItem('spadminOrdersSiteVisible/' + this.reportId) || '',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Дальше',
        cancelButtonText: 'Пойду поищу…',
        inputValidator: (value) => {
          if (!value) {
            return 'Очень надо сайт поставщика указать';
          } else {
            const baseValue = value;
            if (baseValue.match(/[а-я]+/i)) value = punycode.toASCII(value.toLowerCase());
            this.spadminOrdersSite = value;
            this.spadminOrdersSiteVisible = baseValue;
            localStorage.setItem('spadminOrdersSite/' + this.reportId, value);
            localStorage.setItem('spadminOrdersSiteVisible/' + this.reportId, baseValue);
          }
        },
      });

      window.spadmin.log.info('siteSelected = ', siteSelected);
      window.spadmin.log.info('this.spadminOrdersSite = ', this.spadminOrdersSite);
      if (!siteSelected.isConfirmed || siteSelected.dismissed || !this.spadminOrdersSite) return;

      let cataloguesObject = {all: 'Из всех'};
      this.reportCatalogues.forEach((cat => {cataloguesObject[cat] = cat;}));
      const catalogueSelected = await Swal.fire({
        title: 'Из какого каталога выбираем заказы:',
        icon: 'question',
        input: 'select',
        inputValue: localStorage.getItem('spadminCatalogueSelected/' + this.reportId) || false,
        inputOptions: cataloguesObject,
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Дальше',
        cancelButtonText: 'Дай подумать…',
        inputValidator: (value) => {
          return new Promise((resolve) => {
            if (value) {
              this.selectedCatalogue = value;
              localStorage.setItem('spadminCatalogueSelected/' + this.reportId, value);
              window.spadmin.log.info('this.selectedCatalogue = ', this.selectedCatalogue);
            }
            resolve();
          });
        },
      });
      window.spadmin.log.info('catalogueSelected = ', catalogueSelected);
      if (!catalogueSelected.isConfirmed || catalogueSelected.dismissed) return;

      const choosedToFixOrders = await Swal.fire({
        title: 'Ещё немного…',
        icon: 'question',
        input: 'checkbox',
        inputValue: true,
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        inputPlaceholder: 'Фиксировать выгружаемые заказы ?',
        confirmButtonText: 'Вот так',
        cancelButtonText: 'Я подумаю…',
        inputValidator: (result) => {
          this.choosedToFixOrders = result;
        },
      });
      window.spadmin.log.info('choosedToFixOrders = ', choosedToFixOrders, this.choosedToFixOrders);
      if (!choosedToFixOrders.isConfirmed || choosedToFixOrders.dismissed) return;

      const statusSelected = await Swal.fire({
        title: 'Ну-с, начнём',
        html: 'Заказы в каком статусе обработаем?',
        icon: 'question',
        input: 'select',
        inputOptions: {
          fixed: 'Зафиксировано',
          new: 'Новый',
          checked: 'Все выбранные галочкой',
          all: 'Вообще все',
        },
        inputValue: localStorage.getItem('selectStatus=' + this.reportId) || false,
        inputPlaceholder: 'Выберите статус заказов для обработки:',
        inputValidator: (value) => {
          return new Promise((resolve) => {
            if (value) {
              this.selectStatus = value;
              localStorage.setItem('selectStatus=' + this.reportId, value);
              resolve();
            } else resolve('Выберите статус заказов для обработки');
          });
        },
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Да, всё ОК, поехали!!',
        cancelButtonText: 'Ой',
      }).then((result) => {
        if (result.isConfirmed) {
          window.spadmin.log.info({selectStatus: this.selectStatus}, this.orderStateRegexps[this.selectStatus]);

          this.setStatus('fill');

          window.setTimeout(async () => {

            const fillOrdersResult = await this.fillOrders().catch(this.reportError);
            window.spadmin.log.info('fillOrdersResult = ', fillOrdersResult);

            if (!this.reportOrdersLength) {
              this.reportError('Не найдены заказы выбранного типа (' + this.orderStateRegexps[this.selectStatus] + ')');
              this.resetStatus();
              return;
            }

            window.spadmin.log.info('this.reportOrders = ', this.reportOrders);

            if (this.choosedToFixOrders) {
              this.setStatus('fix');
              window.setTimeout(async () => {

                if (this.selectStatus !== 'fixed') {

                  const fixOrdersResult = await this.fixOrders();
                  window.spadmin.log.info({fixOrdersResult});

                  if (fixOrdersResult !== true) {
                    this.reportError(`Не удалось зафиксировать выбранные заказы: ${ fixOrdersResult }`);
                    this.resetStatus();
                    return;
                  }
                }

                this.setStatus('upload');
                this.uploadOrders();

              }, 500);
            } else {
              window.setTimeout(async () => {
                this.setStatus('upload');
                this.uploadOrders();

              }, 500);
            }

          }, 500);
        }
      });
    },
    setOrdersToState: async function(state, errorMessage) {
      try {
        const stateOrders = {};
        const ordersArray = Object.values(this.reportOrders);

        ordersArray.map(itemOrders => {
          spadmin.log.info('setOrdersToState() => itemOrders[0].setOrderStatus = ', itemOrders[0].setOrderStatus);
          spadmin.log.info('setOrdersToState() => Number(itemOrders[0].setOrderStatus) = ', Number(itemOrders[0].setOrderStatus));
          spadmin.log.info('setOrdersToState() => state = ', state);
          spadmin.log.info('setOrdersToState() => itemOrders = ', itemOrders);
          if (Number(itemOrders[0].setOrderStatus) === state) stateOrders[itemOrders[0].orderCode] = itemOrders;
        });

        if (Object.keys(stateOrders).length) {
          const formBody = this.createPostBody({
            cmd: 'change_orders_state',
            orders: stateOrders,
            new_state: state,
          });
          const requestData = this.createRequestData(formBody);
          await this.waitTimeout(1500);
          const req = await fetch('https://superpuper.ru/function.php', requestData);
          const resp = await req.json();
          if (resp.state === 'ok') return true;
          else {
            await this.reportError(errorMessage);
            return false;
          }

        } else return true;

      } catch (e) {
        await this.reportError(errorMessage + '\n' + e.message);
        return false;
      }

    },
    checkOrderPrices: async function(errorMessage) {

      try {
        const ordersArray = Object.values(this.reportOrders);
        spadmin.log.info('checkOrderPrices() » ordersArray = ', ordersArray);
        const ordersWithNewPricesArray = [];

        ordersArray.map(itemOrders => {
          itemOrders.forEach(itemPersonOrder => {
            spadmin.log.info('checkOrderPrices() » itemPersonOrder = ', itemPersonOrder);
            if (('setPrice' in itemPersonOrder) && Number(itemPersonOrder.orderPrice) !== Number(itemPersonOrder.setPrice)) {
              ordersWithNewPricesArray.push(itemPersonOrder);
            }

          });
        });

        spadmin.log.info('checkOrderPrices() » ordersWithNewPricesArray = ', ordersWithNewPricesArray);
        if (!ordersWithNewPricesArray.length) return 'No orders with new prices';

        return await this.setOrderPrices(ordersWithNewPricesArray);

      } catch (e) {
        this.logError(e);
        await this.reportError(errorMessage + '\n' + e.message);
        return false;
      }

    },
    setOrderPrices: async function(ordersWithNewPricesArray) {
      if (ordersWithNewPricesArray.length) {
        const nextOrder = ordersWithNewPricesArray.shift();
        await this.setOrderPrice(nextOrder);

        return await this.setOrderPrices(ordersWithNewPricesArray);

      }
      return true;
    },
    setOrderPrice: async function(orderData) {

      try {
        spadmin.log.info('setOrderPrice() » orderData = ', orderData);

        const formBody = this.createPostBody({
          cmd: 'set_lot_cost',
          order: orderData.orderId,
          lot_cost: `${ orderData.setPrice }.00`,
        });
        spadmin.log.info('setOrderPrice() » formBody = ', formBody);

        const requestData = this.createRequestData(formBody);
        await this.waitTimeout(1500);
        const req = await fetchTimeout('https://superpuper.ru/function.php', requestData, 150000, 'Время подключения к серверу истекло');

        const respStatus = req.status;
        const respStatusText = req.statusText;
        if (respStatus !== 200) {
          const respError = `Ошибка сервера ${ respStatus }: ${ respStatusText }`;
          this.successMessages.push(`<span class="error-text">Не удалось заменить цену заказа №${ orderData.orderId } ( код/артикул: ${ orderData.orderCode } — ${ orderData.orderPrice } р. ) для участника «${ orderData.orderUserId }» на <b>${ orderData.setPrice }</b> р.\n${ respError }\nЗамените цену вручную</span>`);
          this.reportErrorPass(`Не удалось заменить цену для товара код/арт.: ${ orderData.orderCode } на ${ orderData.setPrice } р.:\n${ respError }\nЗамените цену вручную`);
          return false;
        }

        const resp = await req.json();
        if (resp.state === 'ok') {
          this.successMessages.push(`Цена заказа №${ orderData.orderId } ( код/артикул: ${ orderData.orderCode } — ${ orderData.orderPrice } р. ) для участника «${ orderData.orderUserId }» успешно изменена на <b>${ orderData.setPrice }</b> р.`);
          this.reportOk(`Цена заказа №${ orderData.orderId } ( код/артикул: ${ orderData.orderCode } — ${ orderData.orderPrice } р. ) для участника «${ orderData.orderUserId }» успешно изменена на ${ orderData.setPrice } р.`);
          return true;
        } else {
          this.reportErrorPass(`Не удалось изменить цену для заказа №${ orderData.orderId } ( код/артикул: ${ orderData.orderCode } — ${ orderData.orderPrice } р. , ID участника: ${ orderData.orderUserId }) на ${ orderData.setPrice } р. `);
          return false;
        }
      } catch (e) {
        const errorMessage = e.message ?? e;
        this.logError(errorMessage);
        this.successMessages.push(`<span class="error-text">Не удалось заменить цену заказа №${ orderData.orderId } ( код/артикул: ${ orderData.orderCode } — ${ orderData.orderPrice } р. ) для участника «${ orderData.orderUserId }» на <b>${ orderData.setPrice }</b> р.:\n ${ errorMessage }\nЗамените цену вручную</span>`);
        this.reportErrorPass(`Не удалось заменить цену для товара код/арт.: ${ orderData.orderCode } на ${ orderData.setPrice } р.:\n ${ errorMessage }\nЗамените цену вручную`);
        return false;
      }

    },
    finalyze: async function() {

      this.setStatus('finalyze');

      if (!this.reportOrdersLength) {
        this.reportError('Не найдены выгруженные в корзину заказы');
        this.resetStatus();
        return;
      }

      window.spadmin.log.info('this.reportOrders = ', this.reportOrders);
      const loadAccept = await Swal.fire({
            icon: 'success',
            title: 'Ok!',
            html: 'Заказы выгружены в корзину!<br>Нажмите «Ок», чтобы сличить и отметить статусы заказов в отчёте',
            showCancelButton: true,
            confirmButtonColor: '#54d630',
            confirmButtonText: 'Ok',
            cancelButtonColor: '#d33',
            cancelButtonText: 'Ой, нинада',
          },
      );
      if (!loadAccept.isConfirmed) {
        this.resetStatus();
        return;
      }

      let setDeclined;
      let setOrdersNew;
      let setOrdersPrices;

      this.setStatus('setdecline');

      window.spadmin.log.info('this.orderStatuses.declined = ', this.orderStatuses.declined);
      setDeclined = await this.setOrdersToState(this.orderStatuses.declined,
          'Не удалось пометить заказы как отказанные :(');

      if (setDeclined) {
        window.spadmin.log.info({setDeclined});
        this.setStatus('setnew');
        setOrdersNew = await this.setOrdersToState(this.orderStatuses.new, 'Не удалось пометить заказы как новые :(');
      }

      if (setOrdersNew) {
        window.spadmin.log.info({setOrdersNew});
        this.setStatus('setprices');
        setOrdersPrices = await this.checkOrderPrices('Не удалось сверить и заменить цены :(');
      }

      if (setOrdersPrices) {
        window.spadmin.log.info({setOrdersPrices});
        await this.joinReport();
        await this.getReport();

        if (this.reportLink) {
          window.spadmin.log.info({reportLink: this.reportLink});
          const reportTitle = 'Всё получилось!   <a class="spadmin-small spadmin-block" target="_blank" href=" ' + this.reportLink +
              '">Отчёт</a><br>Обновите страницу с помощью Ctrl+F5';
          this.setStatus('ok');
          this.reportOk(reportTitle);
          return;
        }
      }
      this.resetStatus();
    },

    loadCatalogues: function() {
      const orderCatLinkElements = this.reportTable.querySelectorAll('a[title^="Перейти в каталог"]');

      orderCatLinkElements.forEach(link => {
        this.reportCatalogues.push(link.innerText);
      });

      this.reportCatalogues = this.reportCatalogues.filter((elem, pos, arr) => {
        return arr.indexOf(elem) === pos;
      });
      //spadmin.log.info('this.reportCatalogues = ', this.reportCatalogues);
    },

    loadOrdersStatusList: function() {
      const statusSelectOptions = this.selected_orders_status_selector.querySelectorAll('option');
      statusSelectOptions.forEach((opt, id) => {
        this.ordersStatusList.push({
          id,
          value: opt.value,
          style: opt.style,
          title: opt.innerText,
        });
      });
    },

    resetRows: function() {
      this.ordersRows = [];
      this.ordersUsers = new Set();
      this.reportTable
          .querySelectorAll('input[type="hidden-checkbox"]')
          .forEach(el => el.setAttribute('type', 'checkbox'));
      this.reportTable
          .querySelectorAll('input[type="checkbox"][id$="_select"]')
          .forEach(el => {
            el.checked = false;
            el.removeAttribute('checked');
          });
    },

    loadOrdersRows: function() {
      this.resetRows();

      const usersRows = this.reportTable.querySelectorAll('tr[data-user]');
      usersRows.forEach(row => {
        row.removeAttribute('hidden');
        if (row.classList.contains('order')) {
          this.ordersRows.push({
            row,
            'user': row.dataset.user,
            'text': row.innerText,
            'check': row.querySelector('input[type="checkbox"]'),
          });
        }
        this.ordersUsers.add(row.dataset.user);
      });
      spadmin.log.info('this.ordersRows = ', this.ordersRows);
      spadmin.log.info('this.ordersUsers = ', this.ordersUsers);
    },

    filterRows: function() {
      if (!this.ordersFilterText) this.loadOrdersRows();
      else {
        const filterRegexp = new RegExp(this.ordersFilterText, 'i');
        const usersToHide = new Set([...this.ordersUsers]);
        this.ordersRows.forEach(rowData => {
          if (rowData.check) {
            rowData.check.checked = false;
            rowData.check.removeAttribute('checked');
          }
          if (!rowData.text.match(filterRegexp)) {
            rowData.row.setAttribute('hidden', true);
            if (rowData.check) rowData.check.setAttribute('type', 'hidden-checkbox');
          } else {
            usersToHide.delete(rowData.user);
            rowData.row.removeAttribute('hidden');
            if (rowData.check) rowData.check.setAttribute('type', 'checkbox');
          }
        });

        const usersToShow = [...this.ordersUsers].filter(user => !usersToHide.has(user));

        spadmin.log.info('usersToHide = ', usersToHide);
        spadmin.log.info('usersToShow = ', usersToShow);

        usersToHide.forEach(user => {
          this.reportTable.querySelectorAll(`tr[data-user="${ user }"]`).forEach(row => {
            row.setAttribute('hidden', true);
          });
          this.reportTable.querySelectorAll(`tr.user-summary[data-user="${ user }"]`).forEach(row => {
            row.nextElementSibling.setAttribute('hidden', true);
          });
        });

        usersToShow.forEach(user => {
          this.reportTable.querySelectorAll(`tr.name[data-user="${ user }"]`).forEach(row => {
            row.removeAttribute('hidden');
          });
          this.reportTable.querySelectorAll(`tr.user-summary[data-user="${ user }"]`).forEach(row => {
            row.removeAttribute('hidden');
            row.nextElementSibling.removeAttribute('hidden');
          });
        });
      }

      this.reportTable.dispatchEvent(new Event('change'));
      this.statusChecked = false;
    },
  },

  computed: {
    reportOrdersLength: function() {
      return Object.keys(this.reportOrders).length;
    },
  },
  watch: {
    status: function(newStatus) {
      this.disabled = newStatus.match(/loading/);
    },

    selectedOrdersStatus: function(newStatus) {

      this.selected_orders_status_selector.value = newStatus;
      this.selected_orders_status_selector.dispatchEvent(new Event('change'));

      spadmin.log.info(
          'selectedOrdersStatus changed to = ',
          {newStatus, value: this.selected_orders_status_selector.value, selector_state: selector_state('selected_orders_status_selector')});
    },
  },
  beforeMount() {
    const sendFileButton = document.getElementById('send-file');
    if (sendFileButton) {
      this.reportId = sendFileButton.dataset.purchase_id;
      this.spadminOrdersSite = localStorage.getItem('spadminOrdersSite/' + this.reportId) || false;
      this.spadminOrdersSiteVisible = localStorage.getItem('spadminOrdersSiteVisible/' + this.reportId) || false;
    }
  },
  mounted() {
    this.reportTable = document.querySelector('#report table');
    if (this.reportTable) ['change', 'click'].forEach(
        e => this.reportTable.addEventListener(e, this.watchCheckboxesStatus),
    );
    this.selected_orders_status_selector = document.querySelector('select#selected_orders_status_selector');
    if (this.selected_orders_status_selector) this.loadOrdersStatusList();
    this.getReport();
    this.loadCatalogues();
    this.loadOrdersRows();

    //spadmin.log.info('punycode = ', punycode, punycode.toASCII('марьяша-текс.рф'));
  },
};
</script>

<style>

div#faq.vv-app-handler {
  display: flex !important;
  justify-content: flex-end;
  align-items: center;
}

div#faq.vv-app-handler a {
  flex: none;
}

#spadminApp {
  display: flex;
  align-items: center;
  flex: auto;
  transition: background-color 500ms ease, padding 500ms ease;
}

#spadminApp.sticky {
  position: fixed;
  top: 0;
  left: 0;
  margin: auto;
  background-color: #94185E;
  background-image: url(images/s_arrow_right.png), url(images/s_arrow_left.png);
  background-repeat: no-repeat, no-repeat;
  background-position: 1% 45%, 99% 45%;
  color: white;
  min-width: 10em;
  text-align: left;
  border-radius: 0 0 10px 0;
  padding: 1.1em 4em 1.1em 4em;
  opacity: 1;
  z-index: 9999998;
}

input.vv_search-field {
  font-size: 14px;
  margin: auto 2rem;
  padding: 6px 12px;
  border: 1px solid #cccccc;
  border-radius: 4px;
  outline: 0;
}

input.vv_search-field:focus {
  border-color: #66afe9;
  outline: 0;
  -webkit-box-shadow: inset 0 1px 1px rgb(0 0 0 / 8%), 0 0 8px rgb(102 175 233 / 60%);
  box-shadow: inset 0 1px 1px rgb(0 0 0 / 8%), 0 0 8px rgb(102 175 233 / 60%);
}

select.vv-order-status-select {
  margin: auto 0.5rem auto 2rem;
  min-width: 340px;
  display: inline-block;
  min-height: 34px;
  border: 1px solid #cccccc;
  padding: 6px 12px;
  border-radius: 4px;
  outline: 0;
  font-size: 14px;
}

select.vv-order-status-select:focus {
  border-color: #66afe9;
  outline: 0;
  -webkit-box-shadow: inset 0 1px 1px rgb(0 0 0 / 8%), 0 0 8px rgb(102 175 233 / 60%);
  box-shadow: inset 0 1px 1px rgb(0 0 0 / 8%), 0 0 8px rgb(102 175 233 / 60%);
}


button.spadmin-button {
  padding: 7px 7px 7px 35px!important;
  background-image: url(https://spadmin.org/favicon.png);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center left 5px;
  font-family: Comfortaa, Roboto, "Lucida Grande", Verdana, Helvetica, Arial, sans-serif;
  border: 1px solid rgb(118, 118, 118);
  border-radius: 3px;
}

button.spadmin-button.clean {
  background-image: none;
  padding: 7px;
}

button.spadmin-button.iddle::before {
  display: inline-block;
  content: 'Выгрузить заказы в парсер (этап 1)';
}

button.spadmin-button.loading {
  background-image: url(https://static.sp-site.ru/assets/loader/comets/index.svg);
  background-color: #ffffffaa !important;
  color: #333 !important;
}

button.spadmin-button.loading-fill::before {
  display: inline-block;
  content: 'Собираем заказы…';
}

button.spadmin-button.loading-fix::before {
  display: inline-block;
  content: 'Фиксируем заказы…';
}

button.spadmin-button.loading-upload::before {
  display: inline-block;
  content: 'Выгружаем заказы в парсер…';
}

button.spadmin-button.loading-await::before {
  display: inline-block;
  content: 'Ждём заполнения корзины через парсер…  (этап 2)';
}

button.spadmin-button.loading-finalyze::before {
  display: inline-block;
  content: 'Проверяем заказы…  (этап 3)';
}

button.spadmin-button.loading-setdecline::before {
  display: inline-block;
  content: 'Помечаем отказанными отсутствующие позиции…';
}

button.spadmin-button.loading-setnew::before {
  display: inline-block;
  content: 'Помечаем новыми позиции с повышением цены и те что не удалось добавить в корзину…';
}

button.spadmin-button.loading-setprices::before {
  display: inline-block;
  content: 'Сверяем цены…';
}

.spadmin-button.loading-upload::before {
  display: inline-block;
  content: 'Выгружаем результаты в отчёт…';
}

button.spadmin-button.loading-ok {
  background-image: url(https://spadmin.org/favicon.png) !important;
  color: darkgreen;
}

button.spadmin-button.loading-ok::before {
  display: inline-block;
  content: '✓ Всё готово!';
}
</style>
