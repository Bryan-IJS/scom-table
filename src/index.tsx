import {
  Module,
  customModule,
  ControlElement,
  customElements,
  Container,
  IDataSchema,
  HStack,
  Label,
  VStack,
  Styles,
  Control,
  Progress,
  Table,
  Panel,
  Pagination,
  Input,
  observable,
  Button,
  IUISchema,
  moment,
  FormatUtils
} from '@ijstech/components';
import { ITableConfig, formatNumberByFormat, ITableOptions, isNumeric } from './global/index';
import { containerStyle, tableStyle, textStyle } from './index.css';
import assets from './assets';
import dataJson from './data.json';
import ScomChartDataSourceSetup, { ModeType, fetchContentByCID, callAPI, DataSource } from '@scom/scom-chart-data-source-setup';
import { getBuilderSchema, getEmbedderSchema } from './formSchema';
import ScomTableDataOptionsForm from './dataOptionsForm';
const Theme = Styles.Theme.ThemeVars;
const currentTheme = Styles.Theme.currentTheme;

const pageSize = 25;

interface ScomTableElement extends ControlElement {
  lazyLoad?: boolean;
  data: ITableConfig
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      ['i-scom-table']: ScomTableElement;
    }
  }
}

const DefaultData: ITableConfig = {
  dataSource: DataSource.Dune,
  queryId: '',
  apiEndpoint: '',
  title: '',
  options: undefined,
  mode: ModeType.LIVE
};

@customModule
@customElements('i-scom-table')
export default class ScomTable extends Module {
  private vStackTable: VStack;
  private vStackInfo: HStack;
  private hStackFooter: HStack;
  private loadingElm: Panel;
  private lbTitle: Label;
  private lbDescription: Label;
  private pnlTable: Panel;
  private tableElm: Table;
  private columnNames: string[] = [];
  private tableData: { [key: string]: string | number }[] = [];
  private paginationElm: Pagination;
  private lbTotal: Label;
  private inputSearch: Input;

  @observable()
  private totalPage = 0;
  private pageNumber = 0;
  private itemStart = 0;
  private itemEnd = pageSize;

  private _data: ITableConfig = DefaultData;
  tag: any = {};
  defaultEdit: boolean = true;

  static async create(options?: ScomTableElement, parent?: Container) {
    let self = new this(parent, options);
    await self.ready();
    return self;
  }

  constructor(parent?: Container, options?: ScomTableElement) {
    super(parent, options);
  }

  private getData() {
    return this._data;
  }

  private async setData(data: ITableConfig) {
    this._data = data;
    this.updateTableData();
  }

  private getTag() {
    return this.tag;
  }

  private async setTag(value: any, fromParent?: boolean) {
    if (fromParent) {
      this.tag.parentFontColor = value.fontColor;
      this.tag.parentCustomFontColor = value.customFontColor;
      this.tag.parentBackgroundColor = value.backgroundColor;
      this.tag.parentCustomBackgroundColor = value.customBackgoundColor;
      this.onUpdateBlock();
      return;
    }
    const newValue = value || {};
    for (let prop in newValue) {
      if (newValue.hasOwnProperty(prop)) {
        this.tag[prop] = newValue[prop];
      }
    }
    this.width = this.tag.width || 700;
    this.height = this.tag.height || 500;
    this.onUpdateBlock();
  }

  private _getActions(dataSchema: IDataSchema, uiSchema: IUISchema, advancedSchema?: IDataSchema) {
    const builderSchema = getBuilderSchema(this.columnNames);
    const actions = [
      {
        name: 'Edit',
        icon: 'edit',
        command: (builder: any, userInputData: any) => {
          let oldData: ITableConfig = DefaultData;
          let oldTag = {};
          return {
            execute: async () => {
              oldData = JSON.parse(JSON.stringify(this._data));
              const {
                title,
                description,
                ...themeSettings
              } = userInputData;

              const generalSettings: any = {
                title,
                description,
              };

              if (generalSettings) {
                if (advancedSchema) {
                  this._data = { ...this._data, ...generalSettings };
                } else {
                  this._data = { ...generalSettings };
                }
              }
              if (builder?.setData) builder.setData(this._data);
              this.setData(this._data);

              oldTag = JSON.parse(JSON.stringify(this.tag));
              if (builder?.setTag) builder.setTag(themeSettings);
              else this.setTag(themeSettings);
            },
            undo: () => {
              if (advancedSchema) oldData = { ...oldData, options: this._data.options };
              if (builder?.setData) builder.setData(oldData);
              this.setData(oldData);

              this.tag = JSON.parse(JSON.stringify(oldTag));
              if (builder?.setTag) builder.setTag(this.tag);
              else this.setTag(this.tag);
            },
            redo: () => { }
          }
        },
        userInputDataSchema: dataSchema,
        userInputUISchema: uiSchema
      },
      {
        name: 'Data',
        icon: 'database',
        command: (builder: any, userInputData: any) => {
          let _oldData: ITableConfig = DefaultData;
          return {
            execute: async () => {
              _oldData = { ...this._data };
              if (userInputData?.mode) this._data.mode = userInputData?.mode;
              if (userInputData?.file) this._data.file = userInputData?.file;
              if (userInputData?.dataSource) this._data.dataSource = userInputData?.dataSource;
              if (userInputData?.queryId) this._data.queryId = userInputData?.queryId;
              if (userInputData?.apiEndpoint) this._data.apiEndpoint = userInputData?.apiEndpoint;
              if (userInputData?.options !== undefined) this._data.options = userInputData.options;
              if (builder?.setData) builder.setData(this._data);
              this.setData(this._data);
            },
            undo: () => {
              if (builder?.setData) builder.setData(_oldData);
              this.setData(_oldData);
            },
            redo: () => { }
          }
        },
        customUI: {
          render: (data?: any, onConfirm?: (result: boolean, data: any) => void, onChange?: (result: boolean, data: any) => void) => {
            const vstack = new VStack(null, { gap: '1rem' });
            const dataSourceSetup = new ScomChartDataSourceSetup(null, {
              ...this._data,
              chartData: JSON.stringify(this.tableData),
              onCustomDataChanged: async (dataSourceSetupData: any) => {
                if (onChange) {
                  onChange(true, {
                    ...this._data,
                    ...dataSourceSetupData
                  });
                }
              }
            });
            const hstackBtnConfirm = new HStack(null, {
              verticalAlignment: 'center',
              horizontalAlignment: 'end'
            });
            const button = new Button(null, {
              caption: 'Confirm',
              width: 'auto',
              height: 40,
              font: { color: Theme.colors.primary.contrastText }
            });
            hstackBtnConfirm.append(button);
            vstack.append(dataSourceSetup);
            const dataOptionsForm = new ScomTableDataOptionsForm(null, {
              options: this._data.options,
              dataSchema: JSON.stringify(advancedSchema),
              uiSchema: JSON.stringify(builderSchema.advanced.uiSchema)
            });
            vstack.append(dataOptionsForm);
            vstack.append(hstackBtnConfirm);
            if (onChange) {
              dataOptionsForm.onCustomInputChanged = async (optionsFormData: any) => {
                onChange(true, {
                  ...this._data,
                  ...optionsFormData,
                  ...dataSourceSetup.data
                });
              }
            }
            button.onClick = async () => {
              const { dataSource, file, mode } = dataSourceSetup.data;
              if (mode === ModeType.LIVE && !dataSource) return;
              if (mode === ModeType.SNAPSHOT && !file?.cid) return;
              if (onConfirm) {
                const optionsFormData = await dataOptionsForm.refreshFormData();
                onConfirm(true, {
                  ...this._data,
                  ...optionsFormData,
                  ...dataSourceSetup.data
                });
              }
            }
            return vstack;
          }
        }
      }
    ]
    // if (advancedSchema) {
    //   const advanced = {
    //     name: 'Advanced',
    //     icon: 'sliders-h',
    //     command: (builder: any, userInputData: any) => {
    //       let _oldData: ITableOptions = { columns: [] };
    //       return {
    //         execute: async () => {
    //           _oldData = { ...this._data?.options };
    //           if (userInputData?.options !== undefined) this._data.options = userInputData.options;
    //           if (builder?.setData) builder.setData(this._data);
    //           this.setData(this._data);
    //         },
    //         undo: () => {
    //           this._data.options = { ..._oldData };
    //           if (builder?.setData) builder.setData(this._data);
    //           this.setData(this._data);
    //         },
    //         redo: () => { }
    //       }
    //     },
    //     userInputDataSchema: advancedSchema,
    //     userInputUISchema: builderSchema.advanced.uiSchema as any
    //   }
    //   actions.push(advanced);
    // }
    return actions
  }

  getConfigurators() {
    const self = this;
    return [
      {
        name: 'Builder Configurator',
        target: 'Builders',
        getActions: () => {
          const builderSchema = getBuilderSchema(this.columnNames);
          const dataSchema = builderSchema.dataSchema as IDataSchema;
          const uiSchema = builderSchema.uiSchema as IUISchema;
          const advancedSchema = builderSchema.advanced.dataSchema as any;
          return this._getActions(dataSchema, uiSchema, advancedSchema);
        },
        getData: this.getData.bind(this),
        setData: async (data: ITableConfig) => {
          const defaultData = dataJson.defaultBuilderData;
          await this.setData({ ...defaultData, ...data });
        },
        getTag: this.getTag.bind(this),
        setTag: this.setTag.bind(this)
      },
      {
        name: 'Emdedder Configurator',
        target: 'Embedders',
        getActions: () => {
          const embedderSchema = getEmbedderSchema();
          const dataSchema = embedderSchema.dataSchema as IDataSchema;
          const uiSchema = embedderSchema.uiSchema as IUISchema;
          return this._getActions(dataSchema, uiSchema);
        },
        getLinkParams: () => {
          const data = this._data || {};
          return {
            data: window.btoa(JSON.stringify(data))
          }
        },
        setLinkParams: async (params: any) => {
          if (params.data) {
            const utf8String = decodeURIComponent(params.data);
            const decodedString = window.atob(utf8String);
            const newData = JSON.parse(decodedString);
            let resultingData = {
              ...self._data,
              ...newData
            };
            await this.setData(resultingData);
          }
        },
        getData: this.getData.bind(this),
        setData: this.setData.bind(this),
        getTag: this.getTag.bind(this),
        setTag: this.setTag.bind(this)
      }
    ]
  }

  private get dataListFiltered() {
    const searchVal = this.inputSearch?.value.toLowerCase();
    if (searchVal) {
      const cols = this._data?.options?.columns.filter(v => !v.isHidden);
      return this.tableData.filter(v => {
        for (const col of cols) {
          const val = v[col.name];
          if (val?.toString().toLowerCase().includes(searchVal)) {
            return true;
          }
        }
        return false;
      });
    }
    return this.tableData;
  }

  private get dataListPagination() {
    return this.dataListFiltered.slice(this.itemStart, this.itemEnd) || [];
  }

  private updateStyle(name: string, value: any) {
    value ? this.style.setProperty(name, value) : this.style.removeProperty(name);
  }

  private updateTheme() {
    if (this.vStackTable) {
      this.vStackTable.style.boxShadow = this.tag?.darkShadow ? '0 -2px 10px rgba(0, 0, 0, 1)' : 'rgba(0, 0, 0, 0.16) 0px 1px 4px';
    }
    const tags = this.tag || {};
    this.updateStyle('--custom-text-color', tags.customFontColor ? tags.fontColor : tags.parentCustomFontColor ? tags.parentFontColor : '');
    this.updateStyle('--custom-background-color', tags.customBackgroundColor ? tags.backgroundColor : tags.parentCustomBackgroundColor ? tags.parentBackgroundColor : '');
    this.updateStyle('--colors-info-main', tags.progressBackgroundColor);
    this.updateStyle('--colors-success-light', tags.footerBackgroundColor || '#ffeceb');
    this.updateStyle('--colors-success-contrast_text', tags.footerFontColor);
    this.updateStyle('--colors-success-dark', tags.paginationActiveBackgoundColor || '#e47872');
    this.updateStyle('--colors-secondary-contrast_text', tags.paginationActiveFontColor);
    this.updateStyle('--colors-info-light', tags.headerBackgroundColor || '#ffeceb');
    this.updateStyle('--colors-info-contrast_text', tags.headerFontColor);
  }

  private onUpdateBlock() {
    this.renderTable();
    this.updateTheme();
  }

  private async updateTableData() {
    if (this.inputSearch) {
      this.inputSearch.value = '';
    }
    this.loadingElm.visible = true;
    if (this._data?.mode === ModeType.SNAPSHOT)
      await this.renderSnapshotData();
    else
      await this.renderLiveData();
    this.loadingElm.visible = false;
  }

  private async renderSnapshotData() {
    if (this._data.file?.cid) {
      try {
        const data = await fetchContentByCID(this._data.file.cid);
        if (data) {
          const { metadata, rows } = data;
          this.tableData = rows;
          this.columnNames = metadata?.column_names || [];
          this.onUpdateBlock();
          return;
        }
      } catch { }
    }
    this.tableData = [];
    this.columnNames = [];
    this.onUpdateBlock();
  }

  private async renderLiveData() {
    const dataSource = this._data.dataSource as DataSource;
    if (dataSource) {
      try {
        const data = await callAPI({
          dataSource,
          queryId: this._data.queryId,
          apiEndpoint: this._data.apiEndpoint
        });
        if (data) {
          const { metadata, rows } = data;
          this.tableData = rows;
          this.columnNames = metadata?.column_names || [];
          this.onUpdateBlock();
          return;
        }
      } catch { }
    }
    this.tableData = [];
    this.columnNames = [];
    this.onUpdateBlock();
  }

  private renderTable(resize?: boolean) {
    if (!this.tableElm && this._data?.options) return;
    const { title, description } = this._data;
    const { columns } = this._data?.options || {};
    this.lbTitle.caption = title;
    this.lbDescription.caption = description;
    this.lbDescription.visible = !!description;
    this.pnlTable.height = `calc(100% - ${this.vStackInfo.offsetHeight + 10}px)`;
    if (!columns?.length) return;
    if (!resize) {
      let cols = [];
      const _columns = columns.filter(v => !v.isHidden);
      for (const column of _columns) {
        const { name, title, alignContent, type, numberFormat, dateFormat, dateType, coloredNegativeValues, coloredPositiveValues } = column;
        let totalValue = 0;
        if (type === 'progressbar') {
          totalValue = this.tableData.reduce((acc, cur) => {
            if (cur[name]) {
              return acc + Number(cur[name]);
            }
            return acc;
          }, 0);
        }
        const col = {
          title: title || columns[name]?.title || name,
          fieldName: name,
          textAlign: alignContent,
          onRenderCell: function (source: Control, data: any, rowData: any) {
            const isNumber = isNumeric(data);
            const hStack = new HStack(undefined, {
              width: '100%',
              gap: 5,
              wrap: type === 'progressbar' ? undefined : 'wrap',
              verticalAlignment: 'center'
            });
            if (type === 'progressbar') {
              new Progress(hStack, {
                width: 60,
                height: 8,
                strokeWidth: 8,
                strokeColor: Theme.colors.info.main,
                percent: (data / totalValue) * 100
              });
            }
            const lb = new Label(hStack, {
              caption: dateFormat ? moment(data, dateType).format(dateFormat) : isNumber && numberFormat ? formatNumberByFormat(data, numberFormat, true) :
                isNumber ? FormatUtils.formatNumber(data, {decimalFigures: 0}) : data,
              font: {
                size: '12px'
              }
            });
            lb.classList.add(textStyle);
            return hStack;
          }
        }
        cols.push(col);
      }
      this.tableElm.columns = cols;
      this.pageNumber = 1;
      const hasData = !!this.tableData.length;
      this.lbTotal.visible = hasData;
      this.inputSearch.visible = hasData;
      this.lbTotal.caption = `${this.tableData.length} ${this.tableData.length === 1 ? 'row' : 'rows'}`;
      this.updateTableUI();
    }
    this.tableElm.height = `${this.pnlTable.offsetHeight - (this.hStackFooter.offsetHeight + 20)}px`;
  }

  private updateTableUI() {
    this.totalPage = Math.ceil(this.dataListFiltered.length / pageSize);
    this.paginationElm.visible = this.totalPage > 1;
    this.tableElm.data = this.dataListPagination;
  }

  private onSelectIndex() {
    this.pageNumber = this.paginationElm.currentPage;
    this.itemStart = (this.pageNumber - 1) * pageSize;
    this.itemEnd = this.itemStart + pageSize;
    this.updateTableUI();
  }

  private onSearch() {
    this.pageNumber = 1;
    this.updateTableUI();
  }

  private resizeTable() {
    this.renderTable(true);
  }

  async init() {
    this.isReadyCallbackQueued = true;
    super.init();
    this.classList.add(tableStyle);
    this.updateTheme();
    this.setTag({
      progressBackgroundColor: currentTheme.colors.info.main,
      footerBackgroundColor: currentTheme.colors.success.light || '#ffeceb',
      footerFontColor: currentTheme.colors.success.contrastText,
      paginationActiveBackgoundColor: currentTheme.colors.success.dark || '#e47872',
      paginationActiveFontColor: currentTheme.colors.secondary.contrastText,
      headerBackgroundColor: currentTheme.colors.info.light || '#ffeceb',
      headerFontColor: currentTheme.colors.info.contrastText,
      height: 500,
      boxShadow: false
    })
    this.maxWidth = '100%';
    this.vStackTable.style.boxShadow = 'rgba(0, 0, 0, 0.16) 0px 1px 4px';
    const lazyLoad = this.getAttribute('lazyLoad', true, false);
    if (!lazyLoad) {
      const data = this.getAttribute('data', true);
      if (data) {
        this.setData(data);
      }
    }
    const data = this.getAttribute('data', true);
    if (data) {
      this.setData(data);
    }
    this.isReadyCallbackQueued = false;
    this.executeReadyCallback();
    window.addEventListener('resize', () => {
      setTimeout(() => {
        this.resizeTable();
      }, 300);
    });
  }

  render() {
    return (
      <i-vstack
        id="vStackTable"
        position="relative"
        height="100%"
        padding={{ top: 10, bottom: 10, left: 10, right: 10 }}
        class={containerStyle}
      >
        <i-vstack id="loadingElm" class="i-loading-overlay">
          <i-vstack class="i-loading-spinner" horizontalAlignment="center" verticalAlignment="center">
            <i-icon
              class="i-loading-spinner_icon"
              image={{ url: assets.fullPath('img/loading.svg'), width: 36, height: 36 }}
            />
          </i-vstack>
        </i-vstack>
        <i-vstack
          id="vStackInfo"
          width="100%"
          maxWidth="100%"
          margin={{ left: 'auto', right: 'auto', bottom: 10 }}
          verticalAlignment="center"
        >
          <i-label id="lbTitle" font={{ bold: true }} class={textStyle} />
          <i-label id="lbDescription" margin={{ top: 5 }} class={textStyle} />
        </i-vstack>
        <i-panel id="pnlTable">
          <i-panel height="inherit">
            <i-table
              id="tableElm"
              width="100%"
              height="100%"
            />
            <i-hstack id="hStackFooter" gap={10} margin={{ top: 16 }} horizontalAlignment="start" verticalAlignment="center" wrap="wrap">
              <i-label
                id="lbTotal"
                visible={false}
                background={{ color: Theme.colors.success.light }}
                padding={{ top: 4.5, bottom: 4.5, right: 8, left: 8 }}
                font={{ size: '12px', color: Theme.colors.success.contrastText }}
              />
              <i-input
                id="inputSearch"
                visible={false}
                background={{ color: Theme.colors.success.light }}
                placeholder="Search"
                width={168}
                padding={{ top: 4, bottom: 4, right: 8, left: 8 }}
                font={{ size: '12px', color: Theme.colors.success.contrastText }}
                onChanged={this.onSearch}
              />
              <i-pagination
                id="paginationElm"
                width="auto"
                currentPage={this.pageNumber}
                totalPages={this.totalPage}
                onPageChanged={this.onSelectIndex.bind(this)}
              />
            </i-hstack>
          </i-panel>
        </i-panel>
      </i-vstack>
    )
  }
}