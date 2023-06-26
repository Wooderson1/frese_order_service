import {Component, ViewEncapsulation} from '@angular/core';
import * as validateEmail from '../helpers/emailValidator';
import * as validatePhone from '../helpers/phoneValidator';

declare var Stripe;
import {HttpClient} from "@angular/common/http";
import {DataServiceService} from "../services/data-service.service";
import {AlertController, ModalController} from "@ionic/angular";
import {SpinnerService} from "../services/spinner.service";
import {DatePickerPage} from "../date-picker/date-picker.page";
import * as moment from "moment";
import {error} from "protractor";
import {OrderService} from "../services/order.service";
import {SpecialsProductsService} from "../specials-products.service";
import { ProductsService } from '../products.service';

@Component({
  selector: 'app-pay-now',
  templateUrl: './pay-now.page.html',
  styleUrls: ['./pay-now.page.scss'],
  encapsulation: ViewEncapsulation.None
})
export class PayNowPage {
  // stripe = Stripe('pk_live_51KasQqEZvpspKOfSzW7sdVtBJmH1pVuJ7MkqdkFvwMqH1FG2RkSdpI5qDqEzsxeNgUOwODddzocbKqlRu90DAnMA00Y537FNq1');
  stripe = Stripe('pk_test_51KasQqEZvpspKOfSlXnGLRy8IxkOOIZfo5bSREuWGPiK4HCkRyPaSy3m6TqFll4shlG3czSvOiE6eeUEUBG4Ueat00nSgYii4r');
  card: any;
  customerInfo: any = {};
  coupon;
  order;
  createdOrder;
  orderNotes;
  total;
  pickupDate;
  formattedDate;
  availableTimes;
  cart;
  couponApplied = false;
  purchaseInProgress = false;

  constructor(private http: HttpClient,
              private spinnerService: SpinnerService,
              private alertController: AlertController,
              private modalController: ModalController,
              private orderService: OrderService,
              private specialsProductsService: SpecialsProductsService,
              private productsService: ProductsService,
              private dataService: DataServiceService) {
  }

  async ngOnInit() {
    /*
    1. a special exists with slots
    2. a special exists, no slots
    3. no special exists, use regular hours
     */
    this.availableTimes = await this.orderService.getTimesForCart();
    this.availableTimes = Object.keys(this.availableTimes).sort((a,b) => {
      const aDate = new Date(a);
      const bDate = new Date(b);
      return aDate.getTime() < bDate.getTime() ? -1: 1;
    }).reduce(
      (obj, key) => {
        obj[key] = this.availableTimes[key];
        return obj;
      },
      {}
    );
    this.pickupDate =  moment(Object.keys(this.availableTimes)[0]).toDate()
  }

  async ngAfterViewInit() {
    this.setupStripe();
  }

  cancelPayment() {
    this.modalController.dismiss();
  }
  async applyCoupon() {
    const response = await this.dataService.applyCoupon(this.order.id, this.coupon).toPromise();
    if(response.error) {
      await this.presentAlertMessage(response.error, null);
      this.coupon = null;
      return;
    } else {
      this.couponApplied = true;
    }
    this.order = response.message;
  }

  formatDate() {
    const d = this.pickupDate;
    if(!this.pickupDate) { return "Unable to accept new orders at this time!";}
    const hours = d.getHours() > 12 ? (d.getHours() - 12).toLocaleString('en-US', {minimumIntegerDigits: 2}) : d.getHours();
    const minutes = d.getMinutes().toLocaleString('en-US', {minimumIntegerDigits: 2});
    const AMPM = d.getHours() >= 12 ? 'PM' : 'AM';
    return [d.getMonth() + 1,
        d.getDate(),
        d.getFullYear()].join('/') + ' ' +
      [hours,
        minutes].join(':') + " " + AMPM;
  }

  async setPickupTime() {
    const m = await this.modalController.create({
      component: DatePickerPage,
      componentProps: {
        pickupTime: this.pickupDate,
        availableTimes: this.availableTimes
      }
    });
    m.onDidDismiss().then(async (detail: any) => {

      if (detail.data === undefined) {
        return;
      }
      this.pickupDate = detail.data.pickupTime;
    });
    await m.present();
  }

  async requiredFieldsCompleted() {

    if (!this.customerInfo.name || !this.customerInfo.email || !this.customerInfo.phone) {
      await this.presentAlertMessage("Please fill out the required fields.");
      return false;
    } else if (!validateEmail(this.customerInfo.email)) {
      await this.presentAlertMessage("Please enter a valid email");
      return false;
    } else if (!validatePhone(this.customerInfo.phone)) {
      await this.presentAlertMessage("Please enter a valid phone number");
      return false;

    }
    return true;
  }

  async presentAlertMessage(msg, func = null) {
    const binded = func && func.bind(this);
    const alert = await this.alertController.create({
      message: msg,
      buttons: [{
        text: 'Okay',
        cssClass: 'primary',
        handler: () => {
          binded && binded();
        }
      }
      ]
    });
    await alert.present();
  }

  displayAmount(amount) {
    return amount.toFixed(2);
  }

  async makePayment(token) {
    this.spinnerService.showSpinner();
    let paymentData;
    try {
      paymentData = await this.dataService.processPayment({
        amount: this.order.total * 100,
        // cart: this.cart,
        currency: 'usd',
        token: token.id,
        orderId: this.order.id,
        email: this.customerInfo.email,
        phone: this.customerInfo.phone,
        name: this.customerInfo.name,
        pickupTime: this.pickupDate
      }).toPromise();
    } catch (err) {
      if(err.error.message === "Order already paid for") {
        await this.dataService.updateOrderDetails(this.order.id, {
          notes: this.orderNotes,
          pickupTime: this.pickupDate
        }).toPromise();
        await this.presentAlertMessage("It looks like we processed this order already, please call to confirm your order (518) 756-1000");
        await this.modalController.dismiss({success:false});
        return;
      }
      await this.presentAlertMessage("We had trouble processing your payment. Please try again");
      this.purchaseInProgress = false;
      return;
    }

    if (paymentData.status !== "succeeded") {
      this.spinnerService.hideSpinner();

      await this.presentAlertMessage("We had trouble processing your payment. Please try again");
      this.purchaseInProgress = false;

      return;
    } else {
      try {
      await this.dataService.updateOrderDetails(this.order.id, {
        notes: this.orderNotes,
        pickupTime: this.pickupDate
      }).toPromise();
      } catch(err) {
        await this.presentAlertMessage("Something went wrong with your order. Please call the bakery at (518) 756-1000");
      }
      await this.modalController.dismiss({success: true});
    }
  }

  ngOnDestroy() {
    if (this.card) {
      // We remove event listener here to keep memory clean
      this.card.destroy();
    }
  }

  setupStripe() {
    let elements = this.stripe.elements();
    var style = {
      base: {
        color: '#32325d',
        lineHeight: '24px',
        fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
        fontSmoothing: 'antialiased',
        fontSize: '16px',
        '::placeholder': {
          color: '#aab7c4'
        }
      },
      invalid: {
        color: '#fa755a',
        iconColor: '#fa755a'
      }
    };

    this.card = elements.create('card', {style: style});

    this.card.mount('#card-element');

    this.card.addEventListener('change', event => {
      var displayError = document.getElementById('card-errors');
      if (event.error) {
        displayError.textContent = event.error.message;
      } else {
        displayError.textContent = '';
      }
    });

    var form = document.getElementById('payment-form');
    form.addEventListener('submit', async event => {
      event.preventDefault();


      this.purchaseInProgress = true;
      if (!(await this.requiredFieldsCompleted())) {
        this.purchaseInProgress = false;
        return;
      }
      this.stripe.createToken(this.card).then(result => {
        if (result.error) {
          var errorElement = document.getElementById('card-errors');
          errorElement.textContent = result.error.message;
          this.purchaseInProgress = false;
        } else {

          this.makePayment(result.token);
        }
      });
    });
  }
  isPurchaseInProgress() {
    return this.purchaseInProgress;
  }

  async Pay() {
    this.purchaseInProgress = true;
    if (!(await this.requiredFieldsCompleted())) {
      this.purchaseInProgress = false;
      return;
    }
    return;
  }

  //   this.stripe.createToken(this.card).then(result => {
  //     if (result.error) {
  //       var errorElement = document.getElementById('card-errors');
  //       errorElement.textContent = result.error.message;
  //       this.purchaseInProgress = false;
  //     } else {
  //       this.makePayment(result.token);
  //     }
  //   });
  // }
}
