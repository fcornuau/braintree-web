'use strict';

const internal = require('../../../../src/hosted-fields/internal/index');
const frameName = require('../../../../src/hosted-fields/internal/get-frame-name');
const { events } = require('../../../../src/hosted-fields/shared/constants');
const { CreditCardForm } = require('../../../../src/hosted-fields/internal/models/credit-card-form');
const analytics = require('../../../../src/lib/analytics');
const { fake: { configuration }, yieldsByEventAsync } = require('../../../helpers');
const { triggerEvent } = require('../helpers');
const assembleIFrames = require('../../../../src/hosted-fields/internal/assemble-iframes');
const BraintreeError = require('../../../../src/lib/braintree-error');
const focusIntercept = require('../../../../src/hosted-fields/shared/focus-intercept');

describe('internal', () => {
  let testContext;

  beforeEach(() => {
    testContext = {};

    location.hash = 'fake-channel';

    testContext.fakeConfig = {
      fields: {
        number: {},
        cvv: {}
      },
      orderedFields: ['number', 'cvv']
    };

    testContext.cardForm = new CreditCardForm(testContext.fakeConfig);
    jest.spyOn(frameName, 'getFrameName').mockReturnValue(null);
  });

  describe('initialize', () => {
    beforeEach(() => {
      frameName.getFrameName.mockReturnValue('cvv');
      jest.spyOn(internal, 'initialize');
      internal.initialize(testContext.cardForm);
    });

    it('calls FieldComponent to generate the input', () => {
      expect(document.body).toMatchSnapshot();
    });

    it('calls initialize with a CreditCardForm', () => {
      expect(internal.initialize).toHaveBeenCalledWith(expect.any(CreditCardForm));
    });

    describe('text inputs', () => {
      it('sets up autofill inputs for number input', () => {
        let cvv, expMonth, expYear;

        document.body.innerHTML = '';

        frameName.getFrameName.mockReturnValue('number');
        internal.initialize(testContext.cardForm);

        cvv = document.querySelector('#cvv-autofill-field');
        expMonth = document.querySelector('#expiration-month-autofill-field');
        expYear = document.querySelector('#expiration-year-autofill-field');

        expect(cvv).toBeDefined();
        expect(expMonth).toBeDefined();
        expect(expYear).toBeDefined();
        expect(cvv.autocomplete).toBe('cc-csc');
        expect(expMonth.autocomplete).toBe('cc-exp-month');
        expect(expYear.autocomplete).toBe('cc-exp-year');
      });

      it('triggers events on the bus when events occur', () => {
        const input = document.getElementById('cvv');

        jest.spyOn(CreditCardForm.prototype, 'emitEvent').mockReturnValue(null);

        triggerEvent('focus', input);
        triggerEvent('blur', input);
        triggerEvent('click', input);  // not allowed
        triggerEvent('keyup', input);  // not allowed

        expect(CreditCardForm.prototype.emitEvent).toHaveBeenCalledWith('cvv', 'focus');
        expect(CreditCardForm.prototype.emitEvent).toHaveBeenCalledWith('cvv', 'blur');
        expect(CreditCardForm.prototype.emitEvent).not.toHaveBeenCalledWith('cvv', 'click');
        expect(CreditCardForm.prototype.emitEvent).not.toHaveBeenCalledWith('cvv', 'keyup');
      });

      it('is ready to destroy focusIntercept inputs if `REMOVE_FOCUS_INTERCEPTS` fires', () => {
        expect(global.bus.on).toHaveBeenCalledWith(events.REMOVE_FOCUS_INTERCEPTS, focusIntercept.destroy);
      });
    });
  });

  describe('create', () => {
    it('creates a global bus', () => {
      const originalLocationHash = location.hash;

      location.hash = '#test-uuid';
      internal.create();
      expect(global.bus.channel).toBe('test-uuid');

      location.hash = originalLocationHash;
    });

    it('emits that the frame is ready', () => {
      frameName.getFrameName.mockReturnValue('cvv');

      internal.create();

      expect(global.bus.emit).toHaveBeenCalledTimes(1);
      expect(global.bus.emit).toHaveBeenCalledWith(events.FRAME_READY, {
        field: 'cvv'
      }, expect.any(Function));
    });
  });

  describe('orchestrate', () => {
    afterEach(() => {
      delete global.cardForm;
    });

    describe('supporting card types', () => {
      beforeEach(() => {
        jest.spyOn(CreditCardForm.prototype, 'setSupportedCardTypes');
        jest.spyOn(assembleIFrames, 'assembleIFrames').mockReturnValue([]);
        jest.spyOn(CreditCardForm.prototype, 'validateField').mockReturnValue(null);
      });

      it('calls CreditCardForm with supportedCardTypes even when no supported card types are passed', () => {
        const config = {
          client: configuration(),
          fields: {
            number: { selector: '#foo' },
            cvv: { selector: '#boo' },
            postalCode: { selector: '#you' }
          }
        };

        internal.orchestrate(config);

        expect(global.cardForm.supportedCardTypes.length).toBeGreaterThan(9);
        expect(global.cardForm.setSupportedCardTypes).toHaveBeenCalledTimes(1);
      });

      it('sets supported card types asyncronously when rejectUnsupportedCards is set', () => {
        const config = {
          fields: {
            number: { selector: '#foo', rejectUnsupportedCards: true },
            cvv: { selector: '#boo' },
            postalCode: { selector: '#you' }
          }
        };

        jest.spyOn(global.bus, 'emit').mockImplementation(yieldsByEventAsync(events.READY_FOR_CLIENT, configuration()));

        return internal.orchestrate(config).then(() => {
          expect(CreditCardForm.prototype.validateField).toHaveBeenCalledTimes(1);
          expect(CreditCardForm.prototype.validateField).toHaveBeenCalledWith('number');
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledTimes(2);
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledWith(expect.toBeUndefined); // on initialization
          // when client is ready
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledWith({
            americanexpress: true,
            discover: true,
            visa: true
          });
        });
      });

      it('sets supported card types asyncronously when supportedCardBrands is set', () => {
        const config = {
          fields: {
            number: {
              selector: '#foo',
              supportedCardBrands: {
                visa: false,
                'diners-club': true
              }
            },
            cvv: { selector: '#boo' },
            postalCode: { selector: '#you' }
          }
        };

        jest.spyOn(global.bus, 'emit').mockImplementation(yieldsByEventAsync(events.READY_FOR_CLIENT, configuration()));

        return internal.orchestrate(config).then(() => {
          expect(CreditCardForm.prototype.validateField).toHaveBeenCalledTimes(1);
          expect(CreditCardForm.prototype.validateField).toHaveBeenCalledWith('number');
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledTimes(2);
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledWith(expect.toBeUndefined); // on initialization
          // when client is ready
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledWith({
            americanexpress: true,
            discover: true,
            visa: false,
            dinersclub: true
          });
        });
      });

      it('can set supported card brands even without supported cards in merchant gateway configuration', () => {
        const config = {
          fields: {
            number: {
              selector: '#foo',
              supportedCardBrands: {
                visa: false,
                'diners-club': true
              }
            },
            cvv: { selector: '#boo' },
            postalCode: { selector: '#you' }
          }
        };
        const gwConfig = configuration();

        delete gwConfig.gatewayConfiguration.creditCards;

        jest.spyOn(global.bus, 'emit').mockImplementation(yieldsByEventAsync(events.READY_FOR_CLIENT, gwConfig));

        return internal.orchestrate(config).then(() => {
          expect(CreditCardForm.prototype.validateField).toHaveBeenCalledTimes(1);
          expect(CreditCardForm.prototype.validateField).toHaveBeenCalledWith('number');
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledTimes(2);
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledWith(expect.toBeUndefined); // on initialization
          // when client is ready
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledWith({
            visa: false,
            dinersclub: true
          });
        });
      });

      it('prefers supportedCardBrands config if rejectedUnsupportedCards is also set', () => {
        const config = {
          fields: {
            number: {
              selector: '#foo',
              rejectedUnsupportedCards: true,
              supportedCardBrands: {
                visa: false,
                'diners-club': true
              }
            },
            cvv: { selector: '#boo' },
            postalCode: { selector: '#you' }
          }
        };

        jest.spyOn(global.bus, 'emit').mockImplementation(yieldsByEventAsync(events.READY_FOR_CLIENT, configuration()));

        return internal.orchestrate(config).then(() => {
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledTimes(2);
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledWith(expect.toBeUndefined); // on initialization
          // when client is ready
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledWith({
            americanexpress: true,
            discover: true,
            visa: false,
            dinersclub: true
          });
        });
      });

      it('does not call set supported card types an additional time if rejectUnsupportedCards or supportedCardTypes are not set', () => {
        const config = {
          fields: {
            number: { selector: '#foo' },
            cvv: { selector: '#boo' },
            postalCode: { selector: '#you' }
          }
        };

        jest.spyOn(global.bus, 'emit').mockImplementation(yieldsByEventAsync(events.READY_FOR_CLIENT, configuration()));

        return internal.orchestrate(config).then(() => {
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledTimes(1);
        });
      });

      it('does not call set supported card types an additional time if number field is not provided', () => {
        const config = {
          fields: {
            cvv: { selector: '#boo' },
            postalCode: { selector: '#you' }
          }
        };

        jest.spyOn(global.bus, 'emit').mockImplementation(yieldsByEventAsync(events.READY_FOR_CLIENT, configuration()));

        return internal.orchestrate(config).then(() => {
          expect(CreditCardForm.prototype.setSupportedCardTypes).toHaveBeenCalledTimes(1);
        });
      });
    });

    it('posts an analytics event', () => {
      jest.spyOn(assembleIFrames, 'assembleIFrames').mockReturnValue([]);

      internal.orchestrate({
        client: configuration(),
        fields: {
          number: { selector: '#foo' },
          cvv: { selector: '#boo' },
          postalCode: { selector: '#you' }
        }
      });

      expect(analytics.sendEvent).toHaveBeenCalledWith(expect.anything(), 'custom.hosted-fields.load.succeeded');
    });

    it('calls initialize on each frame that has an initialize function', () => {
      const frame1 = {
        braintree: {
          hostedFields: {
            initialize: jest.fn()
          }
        }
      };
      const frame2 = {
        braintree: {
          hostedFields: {
            initialize: jest.fn()
          }
        }
      };
      const frameWithoutInitialize = {
        braintree: {
          hostedFields: {}
        }
      };
      const frameWithoutBraintreeGlobal = {};

      jest.spyOn(assembleIFrames, 'assembleIFrames').mockReturnValue([
        frame1,
        frameWithoutInitialize,
        frameWithoutBraintreeGlobal,
        frame2
      ]);

      internal.orchestrate({
        client: configuration(),
        fields: {
          number: { selector: '#foo' },
          cvv: { selector: '#boo' },
          postalCode: { selector: '#you' }
        }
      });

      expect(frame1.braintree.hostedFields.initialize).toHaveBeenCalledTimes(1);
      expect(frame1.braintree.hostedFields.initialize).toHaveBeenCalledWith(expect.any(CreditCardForm));
      expect(frame2.braintree.hostedFields.initialize).toHaveBeenCalledTimes(1);
      expect(frame2.braintree.hostedFields.initialize).toHaveBeenCalledWith(expect.any(CreditCardForm));
    });

    it('sets up a tokenization handler', () => {
      jest.spyOn(assembleIFrames, 'assembleIFrames').mockReturnValue([]);

      internal.orchestrate({
        client: configuration(),
        fields: {
          number: { selector: '#foo' },
          cvv: { selector: '#boo' },
          postalCode: { selector: '#you' }
        }
      });

      expect(global.bus.on).toHaveBeenCalledTimes(1);
      expect(global.bus.on).toHaveBeenCalledWith(events.TOKENIZATION_REQUEST, expect.any(Function));
    });

    it('sets up a global card form', () => {
      expect(global.cardForm).toBeFalsy();

      jest.spyOn(assembleIFrames, 'assembleIFrames').mockReturnValue([]);

      internal.orchestrate({
        client: configuration(),
        fields: {
          number: { selector: '#foo' },
          cvv: { selector: '#boo' },
          postalCode: { selector: '#you' }
        }
      });

      expect(global.cardForm).toBeInstanceOf(CreditCardForm);
    });

    it('creates a client initialization promise', () => {
      jest.spyOn(global.bus, 'emit').mockImplementation(yieldsByEventAsync(events.READY_FOR_CLIENT, configuration()));
      jest.spyOn(assembleIFrames, 'assembleIFrames').mockReturnValue([]);

      internal.orchestrate({
        fields: {
          number: { selector: '#foo' },
          cvv: { selector: '#boo' },
          postalCode: { selector: '#you' }
        }
      });

      expect(global.bus.emit.mock.calls.filter(value => value[0] === events.READY_FOR_CLIENT).length).toEqual(1);
    });
  });

  describe('createTokenizationHandler', () => {
    const create = internal.createTokenizationHandler;

    beforeEach(() => {
      const requestStub = jest.fn();

      testContext.fakeNonce = 'nonce homeboy';
      testContext.fakeDetails = 'yas';
      testContext.fakeType = 'YASS';
      testContext.fakeDescription = 'fake description';
      testContext.fakeOptions = { foo: 'bar' };
      testContext.binData = { commercial: 'Yes' };

      requestStub.mockResolvedValue({
        creditCards: [{
          nonce: testContext.fakeNonce,
          details: testContext.fakeDetails,
          description: testContext.fakeDescription,
          type: testContext.fakeType,
          foo: 'bar',
          binData: testContext.binData
        }]
      });

      testContext.fakeError = new Error('you done goofed');

      testContext.fakeError.errors = [];
      testContext.fakeError.details = {
        httpStatus: 500
      };

      testContext.details = {
        isValid: true,
        isEmpty: false,
        someOtherStuff: null
      };

      testContext.configuration = configuration();

      testContext.goodClient = {
        getConfiguration() {
          return testContext.configuration;
        },
        request: requestStub
      };

      testContext.badClient = {
        getConfiguration() {
          return testContext.configuration;
        },
        request: jest.fn().mockRejectedValue(testContext.fakeError)
      };

      testContext.emptyCardForm = testContext.cardForm;
      testContext.emptyCardForm.isEmpty = () => true;

      testContext.validCardForm = new CreditCardForm(testContext.fakeConfig);
      testContext.validCardForm.isEmpty = () => false;
      testContext.validCardForm.invalidFieldKeys = () => [];

      testContext.invalidCardForm = new CreditCardForm(testContext.fakeConfig);
      testContext.invalidCardForm.isEmpty = () => false;
      testContext.invalidCardForm.invalidFieldKeys = () => ['cvv'];
    });

    it('returns a function', () => {
      expect(create(testContext.goodClient, testContext.cardForm)).toBeInstanceOf(Function);
    });

    it('replies with an error if tokenization fails due to network', done => {
      create(testContext.badClient, testContext.validCardForm)(testContext.fakeOptions, response => {
        const err = response[0];

        expect(err).toBeInstanceOf(BraintreeError);
        expect(err.type).toBe('NETWORK');
        expect(err.code).toBe('HOSTED_FIELDS_TOKENIZATION_NETWORK_ERROR');
        expect(err.message).toBe('A tokenization network error occurred.');
        expect(err.details.originalError.message).toBe('you done goofed');
        expect(err.details.originalError.errors).toBe(testContext.fakeError.errors);

        done();
      });
    });

    it('replies with client\'s error if tokenization fails due to authorization', done => {
      testContext.fakeError.details.httpStatus = 403;
      testContext.badClient.request.mockRejectedValue(testContext.fakeError);

      create(testContext.badClient, testContext.validCardForm)(testContext.fakeOptions, response => {
        const err = response[0];

        expect(err).toBe(testContext.fakeError);

        done();
      });
    });

    it('replies with an error if tokenization fails due to card data', done => {
      testContext.fakeError.details.httpStatus = 422;
      testContext.badClient.request.mockRejectedValue(testContext.fakeError);

      create(testContext.badClient, testContext.validCardForm)(testContext.fakeOptions, response => {
        const err = response[0];

        expect(err).toBeInstanceOf(BraintreeError);
        expect(err.type).toBe('CUSTOMER');
        expect(err.code).toBe('HOSTED_FIELDS_FAILED_TOKENIZATION');
        expect(err.message).toBe('The supplied card data failed tokenization.');
        expect(err.details.originalError.message).toBe('you done goofed');
        expect(err.details.originalError.errors).toBe(testContext.fakeError.errors);

        done();
      });
    });

    it('sends an analytics event if tokenization fails', done => {
      create(testContext.badClient, testContext.validCardForm)(testContext.fakeOptions, () => {
        expect(analytics.sendEvent).toHaveBeenCalledWith(testContext.badClient, 'custom.hosted-fields.tokenization.failed');

        done();
      });
    });

    it('replies with data if Client API tokenization succeeds', done => {
      create(testContext.goodClient, testContext.validCardForm)(testContext.fakeOptions, arg => {
        expect(arg).toEqual([null, {
          nonce: testContext.fakeNonce,
          details: testContext.fakeDetails,
          description: testContext.fakeDescription,
          type: testContext.fakeType,
          binData: testContext.binData
        }]);

        done();
      });
    });

    it('sends an analytics event if tokenization succeeds', done => {
      create(testContext.goodClient, testContext.validCardForm)(testContext.fakeOptions, () => {
        expect(analytics.sendEvent).toHaveBeenCalledWith(testContext.goodClient, 'custom.hosted-fields.tokenization.succeeded');

        done();
      });
    });

    it('replies with an error if all fields are empty', done => {
      create(testContext.goodClient, testContext.emptyCardForm)(testContext.fakeOptions, response => {
        const err = response[0];

        expect(err).toBeInstanceOf(BraintreeError);
        expect(err.type).toBe('CUSTOMER');
        expect(err.code).toBe('HOSTED_FIELDS_FIELDS_EMPTY');
        expect(err.message).toBe('All fields are empty. Cannot tokenize empty card fields.');
        expect(err.details).not.toBeDefined();

        done();
      });
    });

    it('replies with an error when some fields are invalid', done => {
      create(testContext.goodClient, testContext.invalidCardForm)(testContext.fakeOptions, response => {
        const err = response[0];

        expect(err).toBeInstanceOf(BraintreeError);
        expect(err.type).toBe('CUSTOMER');
        expect(err.code).toBe('HOSTED_FIELDS_FIELDS_INVALID');
        expect(err.message).toBe(
          'Some payment input fields are invalid. Cannot tokenize invalid card fields.'
        );
        expect(err.details).toEqual({
          invalidFieldKeys: ['cvv']
        });

        done();
      });
    });

    it('passes in fieldsToTokenize option to card form', done => {
      const fields = ['number', 'cvv'];
      const invalidFieldKeys = jest.spyOn(testContext.validCardForm, 'invalidFieldKeys');
      const getCardData = jest.spyOn(testContext.validCardForm, 'getCardData');
      const isEmpty = jest.spyOn(testContext.validCardForm, 'isEmpty');

      testContext.fakeOptions.fieldsToTokenize = fields;

      create(testContext.goodClient, testContext.validCardForm)(testContext.fakeOptions, () => {
        expect(invalidFieldKeys).toHaveBeenCalledTimes(1);
        expect(invalidFieldKeys).toHaveBeenCalledWith(fields);
        expect(getCardData).toHaveBeenCalledTimes(1);
        expect(getCardData).toHaveBeenCalledWith(fields);
        expect(isEmpty).toHaveBeenCalledTimes(1);
        expect(isEmpty).toHaveBeenCalledWith(fields);

        done();
      });
    });

    it('makes a client request with validate false if the vault option is not provided', done => {
      create(testContext.goodClient, testContext.validCardForm)(testContext.fakeOptions, () => {
        expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
        expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
          data: {
            creditCard: {
              options: {
                validate: false
              }
            }
          }
        });
        done();
      });
    });

    it('makes a client request without validate false if the vault option is not provided', done => {
      create(testContext.goodClient, testContext.validCardForm)({ vault: true }, () => {
        expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
        expect(testContext.goodClient.request.mock.calls[0][0]).not.toMatchObject({
          data: {
            creditCard: {
              options: {
                validate: false
              }
            }
          }
        });
        done();
      });
    });

    describe('when supplying additional data', () => {
      /* eslint-disable camelcase */

      beforeEach(() => {
        let fakeConfigWithPostalCode;

        fakeConfigWithPostalCode = {
          fields: {
            number: {},
            postalCode: {}
          }
        };

        testContext.cardFormWithPostalCode = new CreditCardForm(fakeConfigWithPostalCode);
        testContext.cardFormWithPostalCode.isEmpty = () => false;
        testContext.cardFormWithPostalCode.invalidFieldKeys = () => [];

        testContext.fakeOptions = {};
      });

      it('tokenizes with additional cardholder name', done => {
        testContext.fakeOptions.cardholderName = 'First Last';

        create(testContext.goodClient, testContext.validCardForm)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: 'clientApi',
            data: {
              creditCard: {
                cardholderName: 'First Last'
              }
            }
          });

          done();
        });
      });

      it('tokenizes street address', done => {
        testContext.fakeOptions.billingAddress = {
          streetAddress: '606 Elm St'
        };

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  street_address: '606 Elm St'
                }
              }
            }
          });

          done();
        });
      });

      it('tokenizes extended address', done => {
        testContext.fakeOptions.billingAddress = {
          extendedAddress: 'Unit 1'
        };

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  extended_address: 'Unit 1'
                }
              }
            }
          });

          done();
        });
      });

      it('tokenizes locality', done => {
        testContext.fakeOptions.billingAddress = {
          locality: 'Chicago'
        };

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  locality: 'Chicago'
                }
              }
            }
          });

          done();
        });
      });

      it('tokenizes region', done => {
        testContext.fakeOptions.billingAddress = {
          region: 'IL'
        };

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  region: 'IL'
                }
              }
            }
          });

          done();
        });
      });

      it('tokenizes first name', done => {
        testContext.fakeOptions.billingAddress = {
          firstName: 'First'
        };

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  first_name: 'First'
                }
              }
            }
          });

          done();
        });
      });

      it('tokenizes last name', done => {
        testContext.fakeOptions.billingAddress = {
          lastName: 'Last'
        };

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  last_name: 'Last'
                }
              }
            }
          });

          done();
        });
      });

      it('tokenizes company', done => {
        testContext.fakeOptions.billingAddress = {
          company: 'Company'
        };

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  company: 'Company'
                }
              }
            }
          });

          done();
        });
      });

      it('tokenizes country name', done => {
        testContext.fakeOptions.billingAddress = {
          countryName: 'United States'
        };

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  country_name: 'United States'
                }
              }
            }
          });

          done();
        });
      });

      it('tokenizes country code alpha 2', done => {
        testContext.fakeOptions.billingAddress = {
          countryCodeAlpha2: 'US'
        };

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  country_code_alpha2: 'US'
                }
              }
            }
          });

          done();
        });
      });

      it('tokenizes country code alpha 3', done => {
        testContext.fakeOptions.billingAddress = {
          countryCodeAlpha3: 'USA'
        };

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  country_code_alpha3: 'USA'
                }
              }
            }
          });

          done();
        });
      });

      it('tokenizes numeric country code', done => {
        testContext.fakeOptions.billingAddress = {
          countryCodeNumeric: '840'
        };

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  country_code_numeric: '840'
                }
              }
            }
          });

          done();
        });
      });

      it('tokenizes with additional postal code data when Hosted Fields has no postal code field', done => {
        testContext.fakeOptions.billingAddress = {
          postalCode: '33333'
        };

        create(testContext.goodClient, testContext.validCardForm)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  postal_code: '33333'
                }
              }
            }
          });

          done();
        });
      });

      it('tokenizes with Hosted Fields postal code', done => {
        testContext.cardFormWithPostalCode.set('postalCode.value', '11111');

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  postal_code: '11111'
                }
              }
            }
          });

          done();
        });
      });

      it('prioritizes Hosted Fields postal code even when the field is empty', done => {
        testContext.fakeOptions.billingAddress = {
          postalCode: '33333'
        };

        testContext.cardFormWithPostalCode.set('postalCode.value', '');

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                billing_address: {
                  postal_code: ''
                }
              }
            }
          });

          done();
        });
      });

      it('does not override other parts of the form with options', done => {
        testContext.fakeOptions.number = '3333 3333 3333 3333';

        testContext.cardFormWithPostalCode.set('number.value', '1111111111111111');

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.any(Object));
          expect(testContext.goodClient.request.mock.calls[0][0]).toMatchObject({
            api: expect.any(String),
            data: {
              creditCard: {
                number: '1111111111111111'
              }
            }
          });

          done();
        });
      });

      it('does not attempt to tokenize non-allowed billing address options', done => {
        testContext.cardFormWithPostalCode.set('number.value', '1111 1111 1111 1111');
        testContext.fakeOptions.billingAddress = {
          foo: 'bar',
          baz: 'qup'
        };

        create(testContext.goodClient, testContext.cardFormWithPostalCode)(testContext.fakeOptions, () => {
          const clientApiRequestArgs = testContext.goodClient.request.mock.calls[0][0];

          expect(testContext.goodClient.request).toHaveBeenCalledWith(expect.not.objectContaining({
            data: {
              creditCard: {
                billing_address: {
                  foo: 'bar',
                  baz: 'qup'
                }
              }
            }
          }));
          expect(clientApiRequestArgs.data.creditCard.billing_address.foo).toBeFalsy();
          expect(clientApiRequestArgs.data.creditCard.billing_address.baz).toBeFalsy();

          done();
        });
      });
      /* eslint-enable camelcase */
    });

    it('sends Client API error when Client API fails', done => {
      const fakeErr = new Error('it failed');

      fakeErr.details = { httpStatus: 500 };

      testContext.goodClient.request.mockRejectedValue(fakeErr);

      create(testContext.goodClient, testContext.validCardForm)(testContext.fakeOptions, args => {
        const err = args[0];
        const result = args[1];

        expect(err).toBeInstanceOf(BraintreeError);
        expect(err.type).toBe('NETWORK');
        expect(err.code).toBe('HOSTED_FIELDS_TOKENIZATION_NETWORK_ERROR');
        expect(err.message).toBe('A tokenization network error occurred.');
        expect(err.details.originalError).toBe(fakeErr);

        expect(result).not.toBeDefined();

        done();
      });
    });

    it('sends a wrapped fail on duplicate payment method error', done => {
      const originalError = {
        fieldErrors: [{
          fieldErrors: [{
            code: '81724',
            field: 'creditCard',
            message: 'Already in vault'
          }]
        }]
      };
      const fakeErr = new BraintreeError({
        code: 'CLIENT_REQUEST_ERROR',
        type: BraintreeError.types.NETWORK,
        message: 'An error',
        details: {
          httpStatus: 422,
          originalError
        }
      });

      testContext.goodClient.request = jest.fn().mockRejectedValue(fakeErr);

      create(testContext.goodClient, testContext.validCardForm)(testContext.fakeOptions, args => {
        const err = args[0];
        const result = args[1];

        expect(err).toBeInstanceOf(BraintreeError);
        expect(err.type).toBe('CUSTOMER');
        expect(err.code).toBe('HOSTED_FIELDS_TOKENIZATION_FAIL_ON_DUPLICATE');
        expect(err.message).toBe('This credit card already exists in the merchant\'s vault.');
        expect(err.details.originalError).toBe(originalError);

        expect(result).not.toBeDefined();

        done();
      });
    });

    it('sends a wrapped cvv verification error', done => {
      const originalError = {
        fieldErrors: [{
          fieldErrors: [{
            code: '81736',
            field: 'cvv',
            message: 'cvv verification failed'
          }]
        }]
      };
      const fakeErr = new BraintreeError({
        code: 'CLIENT_REQUEST_ERROR',
        type: BraintreeError.types.NETWORK,
        message: 'An error',
        details: {
          httpStatus: 422,
          originalError
        }
      });

      testContext.goodClient.request = jest.fn().mockRejectedValue(fakeErr);

      create(testContext.goodClient, testContext.validCardForm)(testContext.fakeOptions, args => {
        const err = args[0];
        const result = args[1];

        expect(err).toBeInstanceOf(BraintreeError);
        expect(err.type).toBe('CUSTOMER');
        expect(err.code).toBe('HOSTED_FIELDS_TOKENIZATION_CVV_VERIFICATION_FAILED');
        expect(err.message).toBe('CVV verification failed during tokenization.');
        expect(err.details.originalError).toBe(originalError);

        expect(result).not.toBeDefined();

        done();
      });
    });

    it('can take a client initialization promise to defer the request until the client is ready', done => {
      let clientPromise, client;

      jest.useFakeTimers();

      client = testContext.goodClient;
      clientPromise = new Promise(resolve => {
        setTimeout(() => {
          resolve(client);
        }, 1000);
      });

      create(clientPromise, testContext.validCardForm)(testContext.fakeOptions, arg => {
        expect(client.request).toHaveBeenCalledTimes(1);
        expect(arg).toEqual([null, {
          nonce: testContext.fakeNonce,
          details: testContext.fakeDetails,
          description: testContext.fakeDescription,
          type: testContext.fakeType,
          binData: testContext.binData
        }]);

        done();
      });

      jest.advanceTimersByTime(950);

      expect(client.request).not.toHaveBeenCalled();

      jest.advanceTimersByTime(100);
      jest.useRealTimers();
    });
  });

  describe('autofillHandler', () => {
    beforeEach(() => {
      frameName.getFrameName.mockReturnValue('cvv');
      testContext.fieldComponent = {
        input: {
          maskValue: jest.fn(),
          updateModel: jest.fn(),
          element: {
            value: '',
            getAttribute: jest.fn(),
            setAttribute: jest.fn()
          }
        }
      };
    });

    it('returns a function', () => {
      expect(internal.autofillHandler(testContext.fieldComponent)).toBeInstanceOf(Function);
    });

    it('returns early if there is no payload', () => {
      const handler = internal.autofillHandler(testContext.fieldComponent);

      handler();
      expect(frameName.getFrameName).not.toHaveBeenCalled();
    });

    it('returns early if payload does not contain a month', () => {
      const handler = internal.autofillHandler(testContext.fieldComponent);

      handler({
        year: '2020'
      });
      expect(frameName.getFrameName).not.toHaveBeenCalled();
    });

    it('returns early if payload does not contain a year', () => {
      const handler = internal.autofillHandler(testContext.fieldComponent);

      handler({
        month: '12'
      });
      expect(frameName.getFrameName).not.toHaveBeenCalled();
    });

    it('noops if input is not an expiration field', () => {
      const handler = internal.autofillHandler(testContext.fieldComponent);

      frameName.getFrameName.mockReturnValue('postalCode');

      handler({
        month: '12',
        year: '2020'
      });

      expect(frameName.getFrameName).toHaveBeenCalled();
      expect(testContext.fieldComponent.input.updateModel).not.toHaveBeenCalled();
    });

    it('updates input with month and year if frame is expiration date', () => {
      const handler = internal.autofillHandler(testContext.fieldComponent);

      frameName.getFrameName.mockReturnValue('expirationDate');

      handler({
        month: '12',
        year: '2020'
      });

      expect(frameName.getFrameName).toHaveBeenCalled();
      expect(testContext.fieldComponent.input.updateModel).toHaveBeenCalledTimes(1);
      expect(testContext.fieldComponent.input.updateModel).toHaveBeenCalledWith('value', '12 / 2020');
      expect(testContext.fieldComponent.input.element.value).toBe('12 / 2020');
    });

    it('masks input if masking is turned on', () => {
      const handler = internal.autofillHandler(testContext.fieldComponent);

      testContext.fieldComponent.input.shouldMask = true;

      frameName.getFrameName.mockReturnValue('expirationDate');

      handler({
        month: '12',
        year: '2020'
      });

      expect(frameName.getFrameName).toHaveBeenCalled();
      expect(testContext.fieldComponent.input.updateModel).toHaveBeenCalledTimes(1);
      expect(testContext.fieldComponent.input.updateModel).toHaveBeenCalledWith('value', '12 / 2020');
      expect(testContext.fieldComponent.input.maskValue).toHaveBeenCalledWith('12 / 2020');
    });

    it('updates input with month if frame is expiration month', () => {
      const handler = internal.autofillHandler(testContext.fieldComponent);

      frameName.getFrameName.mockReturnValue('expirationMonth');

      handler({
        month: '12',
        year: '2020'
      });

      expect(frameName.getFrameName).toHaveBeenCalled();
      expect(testContext.fieldComponent.input.updateModel).toHaveBeenCalledTimes(1);
      expect(testContext.fieldComponent.input.updateModel).toHaveBeenCalledWith('value', '12');
      expect(testContext.fieldComponent.input.element.value).toBe('12');
    });

    it('updates input with year if frame is expiration year', () => {
      const handler = internal.autofillHandler(testContext.fieldComponent);

      frameName.getFrameName.mockReturnValue('expirationYear');

      handler({
        month: '12',
        year: '2020'
      });

      expect(frameName.getFrameName).toHaveBeenCalled();
      expect(testContext.fieldComponent.input.updateModel).toHaveBeenCalledTimes(1);
      expect(testContext.fieldComponent.input.updateModel).toHaveBeenCalledWith('value', '2020');
      expect(testContext.fieldComponent.input.element.value).toBe('2020');
    });

    it('formats year as 4 digit number', () => {
      const handler = internal.autofillHandler(testContext.fieldComponent);

      frameName.getFrameName.mockReturnValue('expirationYear');

      handler({
        month: '12',
        year: '34'
      });

      expect(frameName.getFrameName).toHaveBeenCalled();
      expect(testContext.fieldComponent.input.updateModel).toHaveBeenCalledTimes(1);
      expect(testContext.fieldComponent.input.updateModel).toHaveBeenCalledWith('value', '2034');
      expect(testContext.fieldComponent.input.element.value).toBe('2034');
    });

    it('sends cvv if it exists', () => {
      const handler = internal.autofillHandler(testContext.fieldComponent);

      frameName.getFrameName.mockReturnValue('cvv');

      handler({
        month: '12',
        year: '34',
        cvv: '123'
      });

      expect(frameName.getFrameName).toHaveBeenCalled();
      expect(testContext.fieldComponent.input.updateModel).toHaveBeenCalledTimes(1);
      expect(testContext.fieldComponent.input.updateModel).toHaveBeenCalledWith('value', '123');
      expect(testContext.fieldComponent.input.element.value).toBe('123');
    });

    it('resets placeholder if it exists to account for bug in Safari', () => {
      const handler = internal.autofillHandler(testContext.fieldComponent);

      testContext.fieldComponent.input.element.getAttribute.mockReturnValue('111');
      frameName.getFrameName.mockReturnValue('cvv');

      handler({
        month: '12',
        year: '34',
        cvv: '123'
      });

      expect(frameName.getFrameName).toHaveBeenCalled();
      expect(testContext.fieldComponent.input.element.setAttribute).toHaveBeenCalledTimes(2);
      expect(testContext.fieldComponent.input.element.setAttribute).toHaveBeenCalledWith('placeholder', '');
      expect(testContext.fieldComponent.input.element.setAttribute).toHaveBeenCalledWith('placeholder', '111');
    });

    it('ignores setting placeholder if no placeholder on element', () => {
      const handler = internal.autofillHandler(testContext.fieldComponent);

      testContext.fieldComponent.input.element.getAttribute.mockReturnValue(null);
      frameName.getFrameName.mockReturnValue('cvv');

      handler({
        month: '12',
        year: '34',
        cvv: '123'
      });

      expect(frameName.getFrameName).toHaveBeenCalled();
      expect(testContext.fieldComponent.input.element.setAttribute).not.toHaveBeenCalled();
    });

    it('ignores cvv if it is not present', () => {
      const handler = internal.autofillHandler(testContext.fieldComponent);

      frameName.getFrameName.mockReturnValue('cvv');

      handler({
        month: '12',
        year: '34',
        cvv: ''
      });

      expect(frameName.getFrameName).toHaveBeenCalled();
      expect(testContext.fieldComponent.input.updateModel).not.toHaveBeenCalled();
    });
  });
});
